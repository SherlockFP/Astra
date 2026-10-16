/**
 * Every icon of the open-world map as one list of pins (world metres), built from the zone data and the character's discoveries.
 * The world map and the minimap both draw from it (each filters by its own rules). Undiscovered points are left out, camps and
 * stones only once their cell is explored (fog), rares and bosses while alive. Rebuilt about twice a second by the callers.
 * OWNER: hud module (map rendering).
 */
import { G } from '../../game/G';
import { ENEMIES } from '../../data/enemyKit';
import type { DungeonDef, PackDef } from '../../types/dungeons';
import { TILE_SIZE } from '../../types/dungeons';
import type { Enemy } from '../../entities/Enemy';
import { questGiverMarks, questTargetMarks, waypointKnown } from '../hud/questMarks';
import { seenAt } from './exploration';
import type { FilterId, TrackMode } from './mapStyle';
import { bandTone } from './mapStyle';
import type { PinKind } from './glyphs';

export interface Pin {
  x: number;
  z: number;
  kind: PinKind;
  fam: FilterId;
  /** Hover / minimap name, one line. */
  tip: string;
  /** Higher wins a collision and is drawn last. */
  prio: number;
  col?: string;
  known?: boolean;
  locked?: boolean;
  num?: number;
  /** Short map label (farming spots: `Yaban Domuzu · Sv 5-7`). */
  label?: string;
  /** Area radius (m) of camps and farming spots; drawn as a shaded zone at detail zoom. */
  r?: number;
  /** Quest pins: `quest` is set; `role` = `target` (a blue ring on an objective) or `offer` / `turnin` / `locked` (a gold badge on the giver). */
  quest?: true;
  role?: 'target' | 'offer' | 'turnin' | 'locked';
}

const SHRINE_TR: Record<string, string> = {
  shrine_power: 'Güç Sunağı', shrine_haste: 'Çabukluk Sunağı', shrine_ward: 'Koruma Sunağı', shrine_greed: 'Açgözlülük Sunağı', shrine_wisdom: 'Bilgelik Sunağı',
};
const SHRINE_COL: Record<string, string> = {
  shrine_power: '#ff6a4a', shrine_haste: '#ffe36a', shrine_ward: '#6ab8ff', shrine_greed: '#e8c46a', shrine_wisdom: '#b78aff',
};

const enemyName = (id: string): string => ENEMIES[id]?.name ?? id;

/** Camp label: the mob names of a pack, each once with its count (`Orman Kurdu ×2`). */
const campNames = new Map<string, string>();
function packNames(pk: PackDef): string {
  let s = campNames.get(pk.id);
  if (s !== undefined) return s;
  const cnt = new Map<string, number>();
  for (const m of pk.members) {
    const n = enemyName(m.enemyId);
    cnt.set(n, (cnt.get(n) ?? 0) + 1);
  }
  s = [...cnt].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');
  campNames.set(pk.id, s);
  return s;
}

const tileM = (t: number): number => (t + 0.5) * TILE_SIZE;

/** Pins of the open world that do not depend on the frame (no enemies, no quests). `level` = the player's level. */
export function staticPins(def: DungeonDef, level: number, metinOn: Set<string>): Pin[] {
  const ext = def.world;
  if (!ext) return [];
  const out: Pin[] = [];
  const seen = (x: number, z: number): boolean => seenAt(def, x, z);
  const found = (id: string): boolean => G.character?.save.flags[`world.found.${id}`] === true;

  for (const v of ext.villages) {
    const x = tileM(v.center[0]), z = tileM(v.center[1]);
    if (seen(x, z)) out.push({ x, z, kind: 'village', fam: 'village', tip: `${v.name} · Köy`, prio: 60 });
  }
  for (const w of ext.waypoints) {
    const x = tileM(w.pos[0]), z = tileM(w.pos[1]);
    const known = waypointKnown(w.id);
    if (!known && !seen(x, z)) continue;
    out.push({ x, z, kind: 'waypoint', fam: 'waypoint', tip: known ? `${w.name} · Işınlanma Taşı` : 'Işınlanma Taşı · Keşfedilmedi', prio: 70, known });
  }
  for (const e of ext.entrances) {
    const x = tileM(e.pos[0]), z = tileM(e.pos[1]);
    if (!seen(x, z)) continue;
    const locked = level < e.minLevel;
    out.push({ x, z, kind: 'entrance', fam: 'dungeon', tip: `${e.name} · Zindan · Sv. ${e.minLevel}${locked ? ' gerekli' : ''}`, prio: 80, locked });
  }
  for (const sp of ext.metin.spots) {
    const x = tileM(sp.pos[0]), z = tileM(sp.pos[1]);
    if (!seen(x, z)) continue;
    const on = metinOn.has(sp.id);
    const tier = Math.max(1, ext.metin.tiers.findIndex((tr) => tr.regionId === sp.regionId) + 1);
    out.push({ x, z, kind: 'metin', fam: 'metin', tip: on ? `Metin Taşı · Kademe ${tier} · Canlı` : `Metin Noktası · Kademe ${tier}`, prio: on ? 55 : 20, num: on ? tier : undefined, known: on });
  }
  for (const m of ext.minibosses) {
    const x = tileM(m.lair[0]), z = tileM(m.lair[1]);
    if (!seen(x, z)) continue;
    out.push({ x, z, kind: 'miniboss', fam: 'boss', tip: `${enemyName(m.enemyId)} · Mini Patron · Sv. ${m.level}`, prio: 50 });
  }
  for (const r of ext.rares) {
    for (const [i, j] of r.spots) {
      const x = tileM(i), z = tileM(j);
      if (!seen(x, z)) continue;
      out.push({ x, z, kind: 'rare', fam: 'rare', tip: `${enemyName(r.enemyId)} · Nadir · Sv. ${r.level}`, prio: 45, col: '#e2ecf7' });
    }
  }
  for (const c of ext.chests) {
    const x = tileM(c.pos[0]), z = tileM(c.pos[1]);
    if (seen(x, z)) out.push({ x, z, kind: 'chest', fam: 'chest', tip: 'Sandık', prio: 35 });
  }
  for (const c of ext.cursed) {
    const x = tileM(c.pos[0]), z = tileM(c.pos[1]);
    if (seen(x, z)) out.push({ x, z, kind: 'cursed', fam: 'chest', tip: 'Lanetli Sandık', prio: 35 });
  }
  for (const sh of ext.shrines) {
    const x = tileM(sh.pos[0]), z = tileM(sh.pos[1]);
    if (!seen(x, z)) continue;
    out.push({ x, z, kind: 'shrine', fam: 'shrine', tip: SHRINE_TR[sh.type] ?? 'Sunak', prio: 40, col: SHRINE_COL[sh.type] });
  }
  for (const v of ext.vistas) {
    const x = tileM(v.pos[0]), z = tileM(v.pos[1]);
    if (!seen(x, z)) continue;
    out.push({ x, z, kind: 'vista', fam: 'vista', tip: found(v.id) ? `${v.name} · Manzara` : 'Manzara · Keşfedilmedi', prio: 30, known: found(v.id) });
  }
  for (const l of ext.landmarks) {
    const x = tileM(l.pos[0]), z = tileM(l.pos[1]);
    const f = found(l.id);
    if (!f && !seen(x, z)) continue;
    out.push({ x, z, kind: f ? 'landmark' : 'hidden', fam: 'landmark', tip: f ? `${l.name} · Bölge` : 'Bilinmeyen bölge', prio: f ? 25 : 8, known: f });
  }
  for (const h of ext.hidden) {
    const x = tileM(h.pos[0]), z = tileM(h.pos[1]);
    const f = found(h.id);
    if (!f && !seen(x, z)) continue;
    out.push({ x, z, kind: 'hidden', fam: 'landmark', tip: f ? `${h.name} · Gizli Alan` : 'Gizli Alan · Keşfedilmedi', prio: 12, known: f });
  }
  for (const g of ext.gather) {
    const x = tileM(g.center[0]), z = tileM(g.center[1]);
    if (!seen(x, z)) continue;
    out.push({ x, z, kind: 'gather', fam: 'gather', tip: g.kind === 'ore' ? 'Maden · Toplama' : 'Bitki · Toplama', prio: 12, col: g.kind === 'ore' ? '#9fc3d8' : '#7fd38f' });
  }
  for (const gy of ext.graveyards ?? []) {
    const x = tileM(gy.pos[0]), z = tileM(gy.pos[1]);
    if (seen(x, z)) out.push({ x, z, kind: 'graveyard', fam: 'graveyard', tip: `${gy.name} · Mezarlık`, prio: 22 });
  }
  // camps: farming spots by level band (the band colour is relative to the player's level)
  for (const pk of def.packs) {
    if (!pk.members.length) continue;
    const x = tileM(pk.center[0]), z = tileM(pk.center[1]);
    if (!seen(x, z)) continue;
    const kind: PinKind = pk.kind === 'farm' ? 'farm' : pk.kind === 'elite' ? 'elite' : pk.kind === 'patrol' ? 'patrol' : 'camp';
    const band = pk.levelRange ?? [1, 99];
    const lvTxt = pk.levelRange ? `Sv. ${band[0]}–${band[1]}` : '';
    const what = pk.kind === 'farm' ? 'Kasılacak yer' : pk.kind === 'elite' ? 'Elit kamp' : pk.kind === 'patrol' ? 'Devriye' : 'Kamp';
    const first = packNames(pk).split(', ')[0].replace(/ ×d+$/, '');
    const r = pk.kind === 'farm' ? Math.max(pk.radius ?? 6, 14) : pk.radius ?? 6;
    out.push({ x, z, kind, fam: 'camp', tip: `${packNames(pk)} · ${lvTxt} · ${what}`, label: pk.levelRange ? `${first} · Sv ${band[0]}-${band[1]}` : first, r, prio: pk.kind === 'farm' ? 18 : 15, col: bandTone(level, band as [number, number]), known: true });
  }
  return out;
}

/** Quest rings and giver badges (world metres). */
export function questPins(): Pin[] {
  const out: Pin[] = [];
  try {
    for (const m of questTargetMarks()) out.push({ x: m.x, z: m.z, kind: 'chest', fam: 'quest', tip: m.label, prio: 100, quest: true, role: 'target' });
    for (const g of questGiverMarks()) {
      const role = g.kind === 'turnin' ? 'turnin' : g.kind === 'locked' ? 'locked' : 'offer';
      const tip = role === 'turnin' ? 'Görev · Teslim et' : role === 'locked' ? 'Sonraki görev · Seviye bekliyor' : 'Görev · Almak için konuş';
      out.push({ x: g.x, z: g.z, kind: 'chest', fam: 'quest', tip, prio: 95, quest: true, role });
    }
  } catch (err) {
    console.warn('[map] quest pins', err);
  }
  return out;
}

/**
 * Whether the tracking mode shows a pin: everything (`all`), quests + waypoints + gates (`quest`), or nothing (`off`).
 * The map and the minimap both use it.
 */
export function pinTracked(p: Pin, mode: TrackMode): boolean {
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return p.quest === true || p.fam === 'waypoint' || p.fam === 'dungeon';
}

/** Live bosses and mini-boss enemies (world metres): the alive ones only. */
export function livePins(def: DungeonDef): Pin[] {
  const out: Pin[] = [];
  const w = G.world;
  if (!w || !def.world) return out;
  const rareIds = new Set(def.world.rares.map((r) => r.enemyId));
  for (const e of w.enemies as Enemy[]) {
    if (e.isDead || e.removed || !e.def) continue;
    const boss = e.def.rank === 'boss';
    if (!boss && !rareIds.has(e.def.id)) continue;
    if (boss) out.push({ x: e.position.x, z: e.position.z, kind: 'boss', fam: 'boss', tip: `${e.def.name} · Patron · Canlı`, prio: 75 });
    else out.push({ x: e.position.x, z: e.position.z, kind: 'rare', fam: 'rare', tip: `${e.def.name} · Nadir · Canlı`, prio: 46, col: '#ffffff' });
  }
  return out;
}

