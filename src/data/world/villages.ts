import type { TownNpc, TownNpcRole, TownProp, VillageDef } from '../../types/dungeons';
import { gp, hw, kc, tw } from '../dungeons/kit';
import { hexOf, LAYOUT, modelUrl, round2, type LBuilding, type LNpc, type LVillage } from './layout';
import { questIdsFor } from './quests';
import { WAYPOINTS } from './pois';

/**
 * Sisli Vadi villages (GDD_OPENWORLD §2): Gümüşdere Köyü, Kızılkaya Karakolu, Son Ocak Kampı and the camp hubs Altın Ambar Çiftliği
 * (Rıza, npc_c_riza) and Kanyon Girişi Kampı (Teğmen Deniz, npc_c_deniz). OWNER: content module.
 * Buildings, NPCs, roles, panels and quest givers come from the layout (`villages`); the palisade / wall rows are NOT turned into
 * props: the world builder (WP5) raises the walls from `bounds` + `gates`. A few hand-placed dressings (arches, towers, lamps,
 * siege remains) are listed in DRESSING. Village props and NPCs are metres relative to the village centre.
 */

const ROLE_TITLE: Partial<Record<TownNpcRole, string>> = {
  blacksmith: 'Demirci', merchant: 'Tüccar', alchemist: 'Simyacı', stash: 'Depocu', teleporter: 'Işınlayıcı', quest: 'Görev Veren',
  guard: 'Köy Muhafızı', citizen: 'Köylü', trainer: 'Eğitmen', stable: 'Seyis',
};

/** Village centre (tile coords) and waypoint -> the layout settlement entry. */
const SETTLEMENT = new Map(LAYOUT.settlements.map((s) => [s.id, s]));

/** Gate openings in the palisade (metres relative to the centre, rot = gate normal in degrees). From the layout rows. */
const GATES: Record<string, VillageDef['gates']> = {
  koy_gumusdere: [
    { id: 'kuzey', pos: [0, -28], rot: 0, width: 8 },
    { id: 'guney', pos: [0, 28], rot: 0, width: 8 },
    { id: 'dogu', pos: [40, 0], rot: 90, width: 8 },
  ],
  koy_kizilkaya: [
    { id: 'kuzey', pos: [0, -24], rot: 0, width: 12 },
    { id: 'guney', pos: [0, 24], rot: 0, width: 12 },
  ],
  // the south side of the camp is open (retreat route)
  kamp_son_ocak: [{ id: 'guney', pos: [0, 12], rot: 0, width: 8 }],
  kamp_ciftlik: [{ id: 'guney', pos: [0, 12], rot: 0, width: 8 }],
  kamp_kanyon: [{ id: 'guney', pos: [0, 10], rot: 0, width: 8 }],
};

/** Hand-placed dressing from the layout rows (metres, rot in degrees). */
interface Dressing { model: string; at: [number, number][]; rot?: number; scale?: number; collide?: boolean; light?: TownProp['light'] }
const DRESSING: Record<string, Dressing[]> = {
  koy_gumusdere: [
    { model: hw('arch'), at: [[0, -28], [0, 28]], rot: 0, scale: 1.9 },
    { model: hw('arch'), at: [[40, 0]], rot: 90, scale: 1.9 },
    { model: tw('buildings/red/building_tower_A_red'), at: [[-37, -25], [37, -25], [-37, 25], [37, 25]], scale: 6, collide: true },
    {
      model: gp('lamp_post'), at: [[-5, -20], [-5, -8], [-5, 8], [-5, 20], [5, -20], [5, -8], [5, 8], [5, 20]],
      light: { color: 0xffb060, intensity: 1.4, distance: 9, flicker: true, y: 2.6 },
    },
  ],
  koy_kizilkaya: [
    { model: tw('buildings/red/building_tower_B_red'), at: [[-12, -24], [12, -24], [-12, 24], [12, 24]], scale: 6, collide: true },
    { model: kc('siege-catapult-demolished'), at: [[0, 34], [-14, 38], [16, 36]], collide: true },
    { model: gp('wagon'), at: [[24, 18], [-26, 22]] },
  ],
  kamp_son_ocak: [],
};

const titleOf = (role: string): string | undefined => ROLE_TITLE[role as TownNpcRole];

interface Loop { path: [number, number][]; lap: number }

/**
 * Layout npc -> TownNpc. The layout `model` is prose: "Barbarian (silahsız) tint 0x705030", "Rogue + `1H_Axe`", "npcs/Worker.glb
 * x1.25". Short name = first identifier (or the npcs/ file), tint = hex after "tint", show = backticked accessory names, scale =
 * x1.25 style factor. The note carries the panel / vendor kind, quoted barks, the patrol loop and the idle clip.
 */
function npcOf(n: LNpc, prev: TownNpc | undefined, prevLoop: Loop | undefined): { npc: TownNpc; loop?: Loop } {
  const raw = n.model;
  const note = n.note ?? '';
  // "aynı" (the same) = the previous entry's model, tint and accessories (the layout writes guards this way)
  const same = /^\s*aynı/i.test(raw) && prev !== undefined;
  const file = /npcs\/(\w+)\.glb/.exec(raw);
  const model = same ? prev.model : file ? file[1] : /^\s*(\w+)/.exec(raw)?.[1] ?? 'Barbarian';
  const role = n.role as TownNpcRole;
  const npc: TownNpc = { id: n.id, name: n.name, role, model, pos: [n.x, 0, n.z], rot: n.rot, idle: 'Idle' };
  const title = titleOf(n.role);
  if (title) npc.title = title;
  const tint = hexOf(/tint (0x[0-9a-fA-F]+)/.exec(raw)?.[1]) ?? (same ? prev.tint : undefined);
  if (tint !== undefined) npc.tint = tint;
  const shown = [...raw.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const show = shown.length ? shown : same ? prev.show ?? [] : [];
  if (show.length) npc.show = show;
  const scale = /x(\d\.\d+)/.exec(raw);
  if (scale) npc.scale = Number(scale[1]);
  const idle = /`([A-Za-z_]*(?:Idle|Sit_\w+|Interact)[A-Za-z_]*)`/.exec(note)?.[1];
  if (idle) npc.idle = idle;

  // vendor / service panel: "panel `vendor` kind `merchant`" or "kind `alchemist`" alone
  const panel = /panel `(\w+)`/.exec(note)?.[1];
  const kind = /kind `(\w+)`/.exec(note)?.[1];
  if (panel) npc.ui = kind ? { panel, kind } : { panel };
  else if (kind) npc.ui = { panel: 'vendor', kind };

  const quests = questIdsFor(n.id);
  if (quests.length) npc.quests = quests;

  const lines = [...note.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (lines.length) npc.lines = lines;

  // patrol loop listed by its corners ("tur 120 sn"); "yarım tur arayla" = the previous guard's loop, half a lap later
  let loop: Loop | undefined;
  if (/patrol/i.test(note)) {
    const path = [...note.matchAll(/\((-?\d+),\s*(-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    const lap = Number(/(\d+) sn/.exec(note)?.[1] ?? 120);
    if (path.length >= 2) loop = { path, lap };
  } else if (/yarım tur/.test(note) && prevLoop) {
    const h = Math.floor(prevLoop.path.length / 2);
    loop = { path: [...prevLoop.path.slice(h), ...prevLoop.path.slice(0, h)], lap: prevLoop.lap };
  }
  if (loop) npc.patrol = loop;
  return { npc, loop };
}

function propOf(b: LBuilding, waypointId: string | undefined): TownProp {
  const model = modelUrl(b.model);
  const collide = /\/buildings\//.test(model) || /well/.test(model);
  const p: TownProp = { model, pos: [b.x, 0, b.z], rot: b.rot, scale: b.scale };
  if (collide) p.collide = true;
  if (/waypoint_stone/.test(model) && waypointId) p.id = waypointId;
  return p;
}

function villageOf(v: LVillage): VillageDef {
  const s = SETTLEMENT.get(v.id);
  const center: [number, number] = s?.center ?? [0, 0];
  // the village waypoint = the nearest stone within 8 tiles of the centre; the respawn point stands on it
  const wp = WAYPOINTS.find((w) => Math.hypot(w.pos[0] - center[0], w.pos[1] - center[1]) <= 8 && w.villageId === v.id)
    ?? WAYPOINTS.find((w) => Math.hypot(w.pos[0] - center[0], w.pos[1] - center[1]) <= 8);
  const spawnPos: [number, number] = wp ? [round2((wp.pos[0] - center[0]) * 4), round2((wp.pos[1] - center[1]) * 4)] : [0, 0];

  const props: TownProp[] = v.buildings.map((b) => propOf(b, wp?.id));
  for (const d of DRESSING[v.id] ?? []) {
    for (const [x, z] of d.at) {
      const p: TownProp = { model: d.model, pos: [x, 0, z], rot: d.rot ?? 0, scale: d.scale ?? 1 };
      if (d.collide) p.collide = true;
      if (d.light) p.light = d.light;
      props.push(p);
    }
  }

  const npcs: TownNpc[] = [];
  let prevLoop: Loop | undefined;
  for (const n of v.npcs) {
    const { npc, loop } = npcOf(n, npcs[npcs.length - 1], prevLoop);
    if (loop) prevLoop = loop;
    npcs.push(npc);
  }

  return {
    id: v.id,
    name: v.name,
    center,
    bounds: v.bounds,
    spawn: { pos: spawnPos, facing: 0 },
    props,
    npcs,
    gates: GATES[v.id] ?? [],
    ...(wp ? { waypointId: wp.id } : {}),
  };
}

export const VILLAGES: VillageDef[] = LAYOUT.villages.map(villageOf);
