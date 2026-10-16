/**
 * Zone loader shared by tools/world-density.mjs and tools/world-fill.mjs (OWNER: content module).
 *
 * Sisli Vadi is authored as a JSON layout (src/data/world/sisli_vadi.layout.json). Karakır, Ayaz and Kızıl Sınır are typed TypeScript
 * zones (DungeonDef + WorldExtras). loadZone() turns each of them into the layout shape the two tools read (tile coordinates, the
 * JSON field names), so one audit and one fill pass cover every open-world zone. The typed zones load through the TS hook of
 * dev/combat-sim (registered here), so no build step is needed.
 *
 * Each typed zone writes its generated life to `<zone>_decor.json` (decor + generated landmarks, UTF-8 BOM and CRLF like the
 * layout). The zone module reads that file (src/data/world/decor_zones.ts maps it to DecorDef / LandmarkDef).
 *
 * `biome` names the palette (src/world/decorRecipes.ts BIOME_PALETTE: tint and model swaps). `lmPool` / `vigPool` are the landmark
 * and vignette recipes the fill pass draws from in that zone (the Sisli pools are per region and stay in world-fill.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

register('../dev/combat-sim/hooks.mjs', import.meta.url);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = 4;

export const ZONES = {
  sisli: { label: 'Şişli Vadisi', json: 'src/data/world/sisli_vadi.layout.json' },
  karakir: {
    label: 'Karakır Bozkırı', module: 'src/data/world/karakir.ts', exportName: 'KARAKIR_BOZKIRI', out: 'src/data/world/karakir_decor.json',
    biome: 'karakir',
    lmPool: ['watch_tower_ruin', 'red_castle_ruin', 'standing_stones', 'obelisk_shrine', 'dead_tree_lanterns'],
    vigPool: ['collapsed_wagon', 'graveyard', 'hunter_camp', 'roadside_shrine', 'campfire_camp', 'abandoned_cart', 'graveyard'],
  },
  ayaz: {
    label: 'Ayaz Dağları', module: 'src/data/world/ayaz.ts', exportName: 'AYAZ_DAGLARI', out: 'src/data/world/ayaz_decor.json',
    biome: 'ayaz',
    lmPool: ['standing_stones', 'roadside_chapel', 'giant_tree', 'watch_tower_ruin', 'broken_pier'],
    vigPool: ['hunter_camp', 'campfire_camp', 'roadside_shrine', 'abandoned_cart', 'collapsed_wagon'],
  },
  kizil: {
    label: 'Kızıl Sınır', module: 'src/data/world/kizil_sinir.ts', exportName: 'KIZIL_SINIR', out: 'src/data/world/kizil_sinir_decor.json',
    biome: 'kizil', pvp: true, symmetric: 'xz',
    lmPool: ['red_castle_ruin', 'watch_tower_ruin', 'obelisk_shrine', 'standing_stones'],
    vigPool: ['collapsed_wagon', 'abandoned_cart', 'campfire_camp', 'hunter_camp', 'graveyard'],
  },
};

const abs = (rel) => path.join(ROOT, rel);

/** Layout-shaped view of a typed zone (tile coordinates; the field names of sisli_vadi.layout.json). */
function adapt(def, cfg, pvp) {
  const W = def.world;
  const isGen = (l) => /^lm_f\d+$/.test(l.id);
  const L = {
    tileSize: T,
    grid: { w: def.grid.w, h: def.grid.h },
    rooms: def.rooms.map((r) => ({ id: r.id, name: r.name ?? r.id, rect: { x: r.rect.x, z: r.rect.z, w: r.rect.w, h: r.rect.h } })),
    regions: Object.fromEntries(W.regions.map((r) => [r.id, { room: r.roomId }])),
    water: W.water.map((w) => ({ id: w.id, x0: w.rect.x, z0: w.rect.z, x1: w.rect.x + w.rect.w, z1: w.rect.z + w.rect.h })),
    roads: W.roads,
    packs: def.packs.filter((p) => !p.patrol).map((p) => ({ id: p.id, center: p.center, radius: p.radius ?? 8 })),
    patrols: def.packs.filter((p) => p.patrol).map((p) => ({ id: p.id, center: p.center, patrol: p.patrol })),
    rares: W.rares.map((r) => ({ id: r.id, spots: r.spots })),
    minibosses: W.minibosses.map((m) => ({ id: m.id, lair: m.lair, region: m.regionId })),
    arenas: [],
    landmarks: W.landmarks.map((l) => ({ id: l.id, name: l.name, region: l.regionId, pos: l.pos, recipe: l.recipe, rot: l.rot })),
    vistas: W.vistas.map((v) => ({ id: v.id, name: v.name, region: v.regionId, pos: v.pos })),
    hiddenAreas: W.hidden.map((h) => ({ id: h.id, name: h.name, region: h.regionId, pos: h.pos, radius: h.radius })),
    shrines: W.shrines.map((s) => ({ id: s.id, type: s.type, region: s.regionId, pos: s.pos })),
    waypoints: W.waypoints.map((w) => ({ id: w.id, name: w.name, region: w.regionId, pos: w.pos })),
    entrances: W.entrances.map((e) => ({ id: e.id, name: e.name, pos: e.pos })),
    chests: W.chests.map((c) => ({ id: c.id, kind: c.kind, region: c.regionId, pos: c.pos })),
    cursedChests: W.cursed.map((c) => ({ id: c.id, region: c.regionId, pos: c.pos })),
    gatherFields: W.gather.map((g) => ({ id: g.id, kind: g.kind, region: g.regionId, center: g.center, radiusTiles: g.radius })),
    metinSpots: W.metin.spots.map((m) => ({ id: m.id, region: m.regionId, pos: m.pos })),
    graveyards: (W.graveyards ?? []).map((g) => ({ id: g.id, name: g.name, pos: g.pos })),
    settlements: W.villages.map((v) => ({ id: v.id, name: v.name, center: v.center, halfTiles: [v.bounds[0] / T, v.bounds[1] / T] })),
    villages: W.villages.map((v) => ({
      id: v.id,
      buildings: v.props.map((p) => ({ label: p.model, x: p.pos[0], z: p.pos[2] })),
      npcs: v.npcs.map((n) => ({ id: n.id, x: n.pos[0], z: n.pos[2] })),
    })),
    decor: (W.decor ?? []).map((d) => ({ id: d.id, kind: d.kind, recipe: d.recipe, region: d.regionId, pos: d.pos, rot: d.rot })),
  };
  // the hand-authored landmarks only (generated lm_f* come back through the decor file on a rerun, as in the layout)
  L.landmarks = L.landmarks.filter((l) => !isGen(l));
  L.landmarks.push(...W.landmarks.filter(isGen).map((l) => ({ id: l.id, name: l.name, region: l.regionId, pos: l.pos, recipe: l.recipe, rot: l.rot })));
  // PvP zone: the capture points and the two fort centres are kept clear like points of interest
  if (pvp) {
    L.arenas = [
      ...pvp.CAPTURE_POINTS.map((c) => ({ id: c.id, center: c.tile })),
      ...Object.values(pvp.PVP_BASES).map((b) => ({ id: `base_${b.nation}`, center: b.center })),
    ];
  }
  return L;
}

/**
 * Loads a zone for the tools. Returns { key, label, L (layout-shaped), out (absolute path of the file the fill pass writes),
 * typed, biome, lmPool, vigPool, raw (Sisli: the full layout object) }.
 */
export async function loadZone(key) {
  const cfg = ZONES[key];
  if (!cfg) throw new Error(`unknown zone "${key}" (${Object.keys(ZONES).join(', ')})`);
  if (!cfg.module) {
    const raw = JSON.parse(fs.readFileSync(abs(cfg.json), 'utf8').replace(/^﻿/, ''));
    return { key, label: cfg.label, L: raw, raw, out: abs(cfg.json), typed: false, biome: null, lmPool: null, vigPool: null, symmetric: '' };
  }
  const mod = await import(pathToFileURL(abs(cfg.module)).href);
  const def = mod[cfg.exportName];
  if (!def) throw new Error(`${cfg.module}: no export ${cfg.exportName}`);
  const pvp = cfg.pvp ? await import(pathToFileURL(abs('src/data/pvpZone.ts')).href) : null;
  return {
    key, label: cfg.label, L: adapt(def, cfg, pvp), raw: null, out: abs(cfg.out), typed: true, biome: cfg.biome,
    lmPool: cfg.lmPool, vigPool: cfg.vigPool, symmetric: cfg.symmetric ?? '',
  };
}

// ---- mirror symmetry of a zone's generated life ----------------------------------------------------------------------------
// `symmetric` names the relief's mirror axes ('' none, 'x', 'z' or 'xz'): the relief is mirrored across x = W/2 and z = H/2 (Relief.ts
// symmetric), so the decor is too. A transform t is a bitmask: 1 = mirror in x (x -> W - x), 2 = mirror in z (z -> H - z).

/** The transforms (bitmasks, identity 0 first) of a symmetry setting. */
export function symTransforms(sym) {
  if (sym === 'x') return [0, 1];
  if (sym === 'z') return [0, 2];
  if (sym === 'xz') return [0, 1, 2, 3];
  return [0];
}

/** A point in metres under a transform of a W x H m zone. */
export function mirrorPt([x, z], t, W, H) {
  return [t & 1 ? W - x : x, t & 2 ? H - z : z];
}

/**
 * A yaw (deg) under a transform: the yaw r points along (sin r, cos r) in (x, z), so the mirror in x gives -r, in z gives 180 - r,
 * and both give 180 + r.
 */
export function mirrorYaw(rot, t) {
  let r = t & 1 ? -rot : rot;
  if (t & 2) r = 180 - r;
  return ((Math.round(r) % 360) + 360) % 360;
}

/**
 * Checks that a generated zone file is mirror-symmetric: every decor entry and landmark has its image under each transform (same
 * kind and recipe, position within 0.25 m, yaw within 1.5 deg). Returns the entries without an image (empty = symmetric).
 * Positions are tile coordinates (1 tile = 4 m; the tile centre is (pos + 0.5) x 4 m).
 */
export function symmetryIssues(decor, landmarks, W, H, sym) {
  const trans = symTransforms(sym).filter((t) => t !== 0);
  const items = [
    ...decor.map((d) => ({ id: d.id, key: `${d.kind}/${d.recipe}`, at: [(d.pos[0] + 0.5) * 4, (d.pos[1] + 0.5) * 4], rot: d.rot ?? 0 })),
    ...landmarks.map((l) => ({ id: l.id, key: `landmark/${l.recipe}`, at: [(l.pos[0] + 0.5) * 4, (l.pos[1] + 0.5) * 4], rot: l.rot ?? 0 })),
  ];
  const issues = [];
  for (const it of items) {
    for (const t of trans) {
      const m = mirrorPt(it.at, t, W, H);
      const want = mirrorYaw(it.rot, t);
      const hit = items.some((o) => o.key === it.key && Math.hypot(o.at[0] - m[0], o.at[1] - m[1]) <= 0.25 &&
        Math.min(Math.abs(o.rot - want), 360 - Math.abs(o.rot - want)) <= 1.5);
      if (!hit) issues.push(`${it.id} (${it.key}) has no image under transform ${t}`);
    }
  }
  return issues;
}

/** Writes a typed zone's generated file: BOM and CRLF like the layouts. */
export function writeZoneDecor(out, payload) {
  fs.writeFileSync(out, '﻿' + JSON.stringify(payload, null, 1).replace(/\n/g, '\r\n') + '\r\n');
}
