import type {
  BorderSeg, DungeonDef, LandmarkDef, PackDef, PackMember, RegionTheme, RoomDef, TileRect, TownNpc, TownNpcRole, TownProp, VillageDef, WorldExtras, WorldRegion,
} from '../../types/dungeons';
import { gp, hw, ks, tw } from '../dungeons/kit';
import { CAPTURE_POINTS, PVP_BASES, PVP_CAMP_QUADRANT, PVP_MIN_LEVEL, PVP_TILES, PVP_ZONE_ID, PVP_ZONE_M, mirrorTile } from '../pvpZone';
import { texUrl } from './layout';
import KIZIL_DECOR from './kizil_sinir_decor.json' with { type: 'json' };
import { zoneDecor, zoneFlats, zoneLandmarks } from './decor_zones';

/**
 * KIZIL SINIR (WP-07), the PvP zone. OWNER: content module.
 *
 * 1,200 x 1,200 m (300 x 300 tiles), so the chunk streamer carries the ground and the scenery (docs/ENGINE_BIGMAPS.md: `grid` above
 * 800 m streams on 'auto'; `perf.stream` is spelled out below). Levels 35-40, entered from Kuzgunkale's West Gate
 * (`bati_kapisi`, data/town.ts) by characters of level 35+ (TownScene.exitLock).
 *
 *   north   Gök Kartal karargâhı   (village ks_gok_karargah)   walled fort + PvP safe box + graveyard (spawn)
 *   centre  Kızıl Sınır Ovası      16 neutral elite camps (4 per quadrant, mirrored so both nations face the same map)
 *           the contested keep     3 capture points (data/pvpZone.ts), obelisk rings and watch towers
 *   south   Kızıl Kurt karargâhı   (village ks_kizil_karargah)
 *
 * Geometry lives in data/pvpZone.ts; the rules (hostility, capture, honour) in systems/PvpRules.ts; the runtime (hits, respawn,
 * scoreboard, capture visuals) in systems/Pvp.ts. Reuses Karakır's mobs (kb_*), the town kit buildings and the generic prop kit; the
 * zone has no waypoints (a stone would overwrite the respawn point of the other zones: the dead come back at their own graveyard),
 * no metin, no rares, no world boss.
 */

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const room = (id: string, name: string, r: TileRect): RoomDef => ({ id, name, rect: r, floor: 'dirt', wall: 'cave', explicitDecor: true });

export const ROOMS: RoomDef[] = [
  room('ks0_gok', 'Gök Kartal Karargâhı', rect(100, 10, 100, 50)),
  room('ks1_ova', 'Kızıl Sınır Ovası', rect(10, 60, 280, 180)),
  room('ks2_kizil', 'Kızıl Kurt Karargâhı', rect(100, 240, 100, 50)),
];

interface RegionSpec {
  id: string; roomId: string; name: string; subtitle: string; levels: [number, number];
  fog: [number, number, number]; hemi: [number, number, number]; sun: [number, number];
  tex: [string, string, string, string]; tint: number;
}

// ids r13..r15 continue the Sisli (r1..r6) / Karakır (r7..r10) numbering: `regionOfPack` reads `r<digits>_` from a pack id
const REGION_SPECS: RegionSpec[] = [
  { id: 'r13', roomId: 'ks0_gok', name: 'Gök Kartal Karargâhı', subtitle: 'Güvenli bölge', levels: [35, 35], fog: [0xc8d8ec, 30, 110], hemi: [0xd8e8ff, 0x384050, 1.35], sun: [0xeaf0ff, 1.1],
    tex: ['tt1-grass-13', 'tt2-dirt-17', 'tt3-stone-03', 'tt2-dirt-15'], tint: 0xdde8ff },
  { id: 'r14', roomId: 'ks2_kizil', name: 'Kızıl Kurt Karargâhı', subtitle: 'Güvenli bölge', levels: [35, 35], fog: [0xd8b09a, 30, 110], hemi: [0xf0c8a8, 0x4a2c1c, 1.3], sun: [0xffc890, 1.2],
    tex: ['tt3-terrain-05', 'tt2-dirt-01', 'tt2-stone-17', 'tt2-dirt-09'], tint: 0xffd0c0 },
  { id: 'r15', roomId: 'ks1_ova', name: 'Kızıl Sınır Ovası', subtitle: 'İki ulusun savaş alanı', levels: [35, 40], fog: [0xc8b8a0, 28, 110], hemi: [0xe8dcc0, 0x484030, 1.3], sun: [0xffe0b0, 1.15],
    tex: ['tt3-terrain-10', 'tt2-dirt-19', 'tt3-stone-23', 'tt3-terrain-17'], tint: 0xf0e4cc },
];

export const LANDMARKS: LandmarkDef[] = [
  ...CAPTURE_POINTS.map((p): LandmarkDef => ({ id: `lm_${p.id}`, name: p.name, regionId: 'r15', pos: p.tile, recipe: 'obelisk_shrine' })),
  { id: 'lm_ks_gozcu_k', name: 'Kuzey Gözcü Kulesi', regionId: 'r15', pos: [150, 126], recipe: 'watch_tower_ruin' },
  { id: 'lm_ks_gozcu_g', name: 'Güney Gözcü Kulesi', regionId: 'r15', pos: [150, 174], recipe: 'watch_tower_ruin' },
];

export const REGIONS: WorldRegion[] = REGION_SPECS.map((r): WorldRegion => {
  const theme: RegionTheme = {
    fogColor: r.fog[0], fogNear: r.fog[1], fogFar: r.fog[2],
    hemiSky: r.hemi[0], hemiGround: r.hemi[1], hemiIntensity: r.hemi[2],
    sunColor: r.sun[0], sunIntensity: r.sun[1],
    skyZenith: r.hemi[0], skyHorizon: r.fog[0],
    groundTex: { grass: texUrl(r.tex[0]), dirt: texUrl(r.tex[1]), cobble: texUrl(r.tex[2]), dark: texUrl(r.tex[3]) },
    groundTint: r.tint,
    music: 'world_hills',
    ambientVfx: 'ambient_dust', ambientColor: 0xd8c488,
  };
  return { id: r.id, roomId: r.roomId, name: r.name, subtitle: r.subtitle, levels: r.levels, theme, landmarkId: LANDMARKS.find((l) => l.regionId === r.id)?.id };
});

const ROOM_OF_REGION: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.id, r.roomId]));

const edgesOf = (r: TileRect, style: BorderSeg['style']): BorderSeg[] => [
  { a: [r.x, r.z], b: [r.x + r.w, r.z], style },
  { a: [r.x, r.z + r.h], b: [r.x + r.w, r.z + r.h], style },
  { a: [r.x, r.z], b: [r.x, r.z + r.h], style },
  { a: [r.x + r.w, r.z], b: [r.x + r.w, r.z + r.h], style },
];
/** Rock walls around the open field and the two base pockets (the pockets connect to the field through their shared edge). */
export const BORDERS: BorderSeg[] = [...edgesOf(ROOMS[1].rect, 'cliff')];

// ---------------------------------------------------------------------------------------------------------------------
// Camps: the NW quadrant of data/pvpZone.ts mirrored to the other three
// ---------------------------------------------------------------------------------------------------------------------

const r2 = (v: number): number => Math.round(v * 100) / 100;
const expand = (m: [string, number][]): string[] => m.flatMap(([id, n]) => Array.from({ length: n }, () => id));
function spread(ids: string[], radiusM: number): PackMember[] {
  const rT = Math.min(2.6, (radiusM / 4) * 0.55);
  return ids.map((enemyId, i) => {
    const a = i * 2.39996;
    const d = i === 0 && ids.length > 1 ? 0 : rT * Math.sqrt((i + 0.5) / ids.length);
    return { enemyId, offset: [r2(Math.sin(a) * d), r2(Math.cos(a) * d)] };
  });
}

export const WORLD_PACKS: PackDef[] = [];
{
  let n = 0;
  for (let q = 0; q < 4; q++) {
    for (const c of PVP_CAMP_QUADRANT) {
      n++;
      WORLD_PACKS.push({
        id: `r15_c${String(n).padStart(2, '0')}`,
        roomId: ROOM_OF_REGION.r15,
        center: mirrorTile(c.at, q),
        members: spread(expand(c.members), 13),
        respawnSec: 120,
        levelRange: c.lv,
        radius: 13,
        kind: 'elite',
        championChance: 0,
        note: c.name,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The two bases
// ---------------------------------------------------------------------------------------------------------------------

const bld = (model: string, x: number, z: number, rot: number, scale = 6): TownProp => ({ model, pos: [x, 0, z], rot, scale, collide: true });
const prop = (model: string, x: number, z: number, rot = 0, extra: Partial<TownProp> = {}): TownProp => ({ model, pos: [x, 0, z], rot, scale: 1, ...extra });
const FLAME = { color: 0xffb060, intensity: 1.4, distance: 9, flicker: true, y: 2.6 };

const mkNpc = (id: string, name: string, role: TownNpcRole, model: string, x: number, z: number, rot: number, o: Partial<TownNpc> = {}): TownNpc =>
  ({ id, name, role, model, pos: [x, 0, z], rot, idle: 'Idle', ...o });

/** One fort. `s` = +1 for the northern base (gate faces south, towards the keep), -1 for the southern one (mirrored in z). */
function mkBase(nation: 'gok_kartal' | 'kizil_kurt'): VillageDef {
  const b = PVP_BASES[nation];
  const gk = nation === 'gok_kartal';
  const col = gk ? 'blue' : 'red';
  const pre = gk ? 'npc_ks_gok' : 'npc_ks_kizil';
  const s = gk ? 1 : -1;
  const B = (n: string): string => tw(`buildings/${col}/building_${n}_${col}`);
  const rot = (deg: number): number => (gk ? deg : deg + 180);
  const props: TownProp[] = [
    bld(B('castle'), 0, -16 * s, rot(0), 5),
    bld(B('barracks'), -22, -2 * s, rot(90), 6),
    bld(B('blacksmith'), 22, -2 * s, rot(-90), 6),
    bld(B('market'), -22, 12 * s, rot(90), 6),
    bld(B('tower_B'), -30, -20 * s, 0, 6),
    bld(B('tower_B'), 30, -20 * s, 0, 6),
    bld(B('tower_B'), -30, 21 * s, 0, 6),
    bld(B('tower_B'), 30, 21 * s, 0, 6),
    prop(gp('campfire'), 0, 6 * s, 0, { light: { color: 0xffa050, intensity: 1.6, distance: 11, flicker: true, y: 0.9 } }),
    prop(gp('market_stall'), 10, 8 * s, rot(-90)),
    prop(gp('market_stall'), -10, 8 * s, rot(90)),
    prop(gp('notice_board'), 6, -4 * s, 0),
    prop(gp('altar'), -4, 16 * s, 0, { scale: 0.9 }),            // the graveyard altar: the dead of this nation return here
    prop(gp(gk ? 'banner_blue' : 'banner_red'), -12, 22 * s, 0, { scale: 1.6 }),
    prop(gp(gk ? 'banner_blue' : 'banner_red'), 12, 22 * s, 0, { scale: 1.6 }),
    prop(gp(gk ? 'banner_blue' : 'banner_red'), -34, 0, 90, { scale: 1.4 }),
    prop(gp(gk ? 'banner_blue' : 'banner_red'), 34, 0, 90, { scale: 1.4 }),
    prop(hw('arch'), 0, 28 * s, 0, { scale: 1.9 }),
    prop(gp('lamp_post'), -6, 2 * s, 0, { light: FLAME }),
    prop(gp('lamp_post'), 6, 14 * s, 0, { light: FLAME }),
    prop(gp('lamp_post'), -14, 20 * s, 0, { light: FLAME }),
    prop(ks('tent'), 14, -12 * s, 0, { scale: 2.4 }),
    prop(gp('wagon'), 22, 25 * s, 25, { collide: true }),
    prop(gp('barrel'), 16, -8 * s),
    prop(gp('crate_a'), -16, -8 * s),
  ];
  const npcs: TownNpc[] = [
    mkNpc(`${pre}_komutan`, gk ? 'Kartal Komutanı Aydoğan' : 'Kurt Başı Börteçine', 'guard', 'Knight', 0, -8 * s, rot(0), {
      title: gk ? 'Gök Kartal Komutanı' : 'Kızıl Kurt Komutanı', show: ['2H_Sword'], tint: gk ? 0x6a8cc8 : 0xc86a58,
      lines: [
        'Orta kaledeki üç nokta bizim olmalı. Her noktayı otuz saniye kesintisiz tutarsan bayrağı dikersin.',
        'Karargâhın içinde kimse kimseye dokunamaz. Dışarıda ise sınır kanla çizilir.',
      ],
    }),
    mkNpc(`${pre}_mezar`, 'Mezarlık Bekçisi', 'citizen', 'Mage', -2, 13 * s, rot(0), {
      title: 'Ruh Kılavuzu', show: ['Spellbook_open'], tint: 0x9a88c0, ui: { panel: 'dialog' },
      lines: ['Düşersen on saniye sonra burada, bayrağının dibinde dirilirsin.', 'Öldürdüğün kadar onur kazanırsın; aynı kişiyi tekrar tekrar avlamak ise onurunu eritir.'],
    }),
    mkNpc(`${pre}_tuccar`, 'Karargâh Tüccarı', 'merchant', 'Rogue_Hooded', -16, 6 * s, rot(90), {
      title: 'Tüccar', show: ['Rogue_Cape'], tint: gk ? 0x4a6aa0 : 0xa04a3a, ui: { panel: 'vendor', kind: 'merchant' }, lines: ['Yaraya iksir, yola erzak.'],
    }),
    mkNpc(`${pre}_simyaci`, 'Şifacı Nur', 'alchemist', 'Mage', 14, 10 * s, rot(-90), {
      title: 'Simyacı', show: ['1H_Wand'], tint: 0x40a060, ui: { panel: 'vendor', kind: 'alchemist' }, lines: ['Savaş öncesi bir iksir, savaş sonrası iki.'],
    }),
    mkNpc(`${pre}_demirci`, 'Karargâh Demircisi', 'blacksmith', 'Barbarian', 17, -4 * s, rot(-90), {
      title: 'Demirci', show: ['1H_Axe'], tint: 0xb08060, ui: { panel: 'blacksmith' }, lines: ['Silahın kör mü? Getir, ışıldasın.'],
    }),
    mkNpc(`${pre}_muhafiz_1`, gk ? 'Kartal Muhafızı' : 'Kurt Muhafızı', 'guard', 'Knight', -12, 26 * s, rot(0), {
      show: ['1H_Sword', 'Badge_Shield'], tint: gk ? 0x5a7ab0 : 0xb05a48, lines: ['Sınır sana güvenir.'],
    }),
    mkNpc(`${pre}_muhafiz_2`, gk ? 'Kartal Muhafızı' : 'Kurt Muhafızı', 'guard', 'Knight', 12, 26 * s, rot(0), {
      show: ['1H_Sword', 'Badge_Shield'], tint: gk ? 0x5a7ab0 : 0xb05a48, lines: ['Karşı bayrak yaklaşırsa haber ver.'],
    }),
  ];
  return {
    id: b.village,
    name: b.name,
    center: b.tile,
    bounds: [36, 30],
    safe: { halfX: b.safeHalf[0], halfZ: b.safeHalf[1] },
    spawn: { pos: [0, 16 * s], facing: gk ? 0 : 180 },
    props,
    npcs,
    gates: [
      { id: 'bati', pos: [-36, 0], rot: 90, width: 8 },
      { id: 'dogu', pos: [36, 0], rot: 90, width: 8 },
      { id: 'orta', pos: [0, 30 * s], rot: 0, width: 10 },
    ],
  };
}

export const VILLAGES: VillageDef[] = [mkBase('gok_kartal'), mkBase('kizil_kurt')];

// ---------------------------------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------------------------------

/** Chunk streaming is explicit ('on'), view radius = widest fog far + 64 m. */
const PERF: WorldExtras['perf'] = { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40, stream: 'on', streamChunkM: 64 };

/**
 * Rolling terrain (docs/ENGINE_BIGMAPS.md section 10): moderate hills of the border plain, mirrored in x and z so both nations face the
 * same map, with the contested keep on a raised plateau (the three capture points, the obelisk rings and the watch towers stand on it).
 */
/** Generated life of the zone (tools/world-fill.mjs --zone kizil, the red badlands palette). */
const DECOR = zoneDecor(KIZIL_DECOR, 'kizil');

const RELIEF: WorldExtras['relief'] = {
  seed: 'kizil_sinir',
  cellM: 4,
  symmetric: 'xz',
  profile: { amp: 5, scale: 150 },
  regions: {
    r13: { amp: 3, scale: 150 },
    r14: { amp: 3, scale: 150 },
    r15: { amp: 14, scale: 140, base: 1 },
  },
  edge: { rise: 14, width: 80 },
  plateaus: [{ pos: [150, 150], radius: 78, height: 14, falloff: 64 }],
  flat: zoneFlats(DECOR),
};

const WORLD: WorldExtras = {
  relief: RELIEF,
  regions: REGIONS,
  villages: VILLAGES,
  waypoints: [],
  entrances: [],
  roads: [
    { id: 'yol_kuzey', kind: 'cobble', width: 5, pts: [[150, 52], [150, 80], [150, 120]] },
    { id: 'yol_guney', kind: 'cobble', width: 5, pts: [[150, 248], [150, 220], [150, 180]] },
    { id: 'yol_batidan', kind: 'dirt', width: 4, pts: [[120, 150], [139, 150]] },
    { id: 'yol_doguya', kind: 'dirt', width: 4, pts: [[161, 150], [180, 150]] },
  ],
  water: [],
  borders: BORDERS,
  landmarks: [...LANDMARKS, ...zoneLandmarks(KIZIL_DECOR)],
  decor: DECOR,
  metin: { tiers: [], spots: [] },
  rares: [],
  minibosses: [],
  bosses: [],
  gather: [],
  chests: [
    { id: 'ch_ks_a', kind: 'chest_iron', regionId: 'r15', pos: [60, 150], respawnSec: 1800 },
    { id: 'ch_ks_b', kind: 'chest_iron', regionId: 'r15', pos: [240, 150], respawnSec: 1800 },
    { id: 'ch_ks_c', kind: 'chest_gold', regionId: 'r15', pos: [150, 100], respawnSec: 1800 },
    { id: 'ch_ks_d', kind: 'chest_gold', regionId: 'r15', pos: [150, 200], respawnSec: 1800 },
  ],
  cursed: [],
  shrines: [
    { id: 'sh_ks_a', type: 'shrine_power', regionId: 'r15', pos: [100, 150] },
    { id: 'sh_ks_b', type: 'shrine_haste', regionId: 'r15', pos: [200, 150] },
  ],
  hidden: [],
  vistas: [],
  perf: PERF,
};

const NORTH = PVP_BASES.gok_kartal;

export const KIZIL_SINIR: DungeonDef = {
  id: PVP_ZONE_ID,
  name: 'Kızıl Sınır',
  shortName: 'Sınır',
  lore: 'Gök Kartal ile Kızıl Kurt arasındaki sınır kalesi her mevsim el değiştirir. Üç nokta, iki bayrak, tek bir söz: kazanan tutar.',
  levelRange: [PVP_MIN_LEVEL, 40],
  timerSec: 0,
  forcesRequired: 0,
  theme: {
    fogColor: 0xc8b8a0, fogNear: 28, fogFar: 110, ambient: 0x706850, ambientIntensity: 0.32, hemiSky: 0xe8dcc0, hemiGround: 0x484030,
    torchColor: 0xffa050, bloomStrength: 0.3, music: 'world_hills', palette: [0x504830, 0x8a7a50, 0xc89a78, 0xd4c8a4, 0xc4d4e4], tint: 0xf0e4cc,
  },
  // 300 x 300 tiles = 1,200 m (ENGINE_BIGMAPS: above 800 m the ground and scenery stream by chunk)
  grid: { w: PVP_TILES, h: PVP_TILES },
  rooms: ROOMS,
  doors: [],
  packs: WORLD_PACKS,
  bosses: [],
  // the Gök Kartal fort; Kızıl Kurt characters are moved to their own fort by systems/Pvp.ts when the zone starts
  start: { pos: [NORTH.tile[0], NORTH.tile[1] + 4], facing: 180 },
  exit: { pos: [NORTH.tile[0] + 4, NORTH.tile[1] + 4] },
  outdoor: true,
  world: WORLD,
};

void PVP_ZONE_M;
