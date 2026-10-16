import type { DoorDef, DungeonDef, DungeonTheme, PackDef, RoomDef, TileRect, ZoneDef } from '../../types/dungeons';
import {
  Props, bossAt, circleZone, decorator, door, dg, fu, gp, hw, kg, lt, makeCtx, mon, pack, pt, rectZone, rectsOf, room, shPt, withProps,
} from './kit';
import { makeRescale, oldTileRect, type Rect4 } from './rescale2';

/**
 * GOLGE TAPINAGI (shadow temple) - GDD_CONTENT 4.4. Level 42-52, M+ 15:00, 210 forces (257 available).
 * Layout (rooms / doors / packs / bosses) is generated from docs/GDD_CONTENT.layout.json; decoration is hand placed.
 * Positions are written in GDD coordinates (see the COORDINATES note in kit.ts).
 * The darkest dungeon: violet fog, purple braziers, blood-red runes, void cracks. Corridors are lit by a few dim candles only.
 */

// SCALE PASS (docs/SCALE_REFERENCE.md section 3): combat corridors 2 -> 4 tiles, pull rooms >= 9 short side, boss arenas 12x12.
// OLD_RECT is the layout the hand placed decoration, packs, bosses and extras were written in; they are remapped below.
// Zakhar's arena and the start-to-Kara Hol spine stay as they were.
const OLD_RECT: Record<string, Rect4> = {
  giris: [17, 34, 6, 5], avlu_giris: [14, 27, 12, 7], k_bati: [9, 29, 5, 2], bati_kanadi: [1, 22, 8, 12], k_bati_kuzey: [4, 17, 2, 5],
  nefris_odasi: [0, 6, 10, 11], k_dogu: [26, 29, 5, 2], dogu_kanadi: [31, 22, 8, 12], k_dogu_kuzey: [34, 17, 2, 5],
  kevvas_cukuru: [30, 6, 10, 11], k_merkez_bati: [10, 15, 4, 2], k_merkez_dogu: [26, 15, 4, 2], kara_hol: [14, 15, 12, 12],
  k_final: [19, 14, 2, 1], zakhar_sunagi: [13, 0, 14, 14],
};

// ---- GENERATED from docs/GDD_CONTENT.layout.json (rooms, doors, packs, bosses) ----
const ROOMS: RoomDef[] = [
  room('giris', 'Mühürlü Kapı', 17, 36, 6, 5, 'temple', 'temple', 0.3),
  room('avlu_giris', 'Mühürlü Avlu', 14, 27, 12, 9, 'temple', 'temple', 0.5),
  room('k_bati', 'Fısıltı Koridoru', 9, 30, 5, 4, 'temple', 'temple', 0.3),
  room('bati_kanadi', 'Fısıltı Kanadı', 0, 24, 9, 12, 'temple', 'temple', 0.6),
  room('k_bati_kuzey', 'Gözcü Merdiveni', 2, 19, 4, 5, 'temple', 'temple', 0.3),
  room('nefris_odasi', 'Gözcü Odası', 0, 7, 12, 12, 'temple', 'temple', 0.2, { boss: 1 }),
  room('k_dogu', 'Ayin Koridoru', 26, 30, 5, 4, 'temple', 'temple', 0.3),
  room('dogu_kanadi', 'Ayin Kanadı', 31, 24, 9, 12, 'temple', 'temple', 0.6),
  room('k_dogu_kuzey', 'Çukur Merdiveni', 34, 19, 4, 5, 'temple', 'temple', 0.3),
  room('kevvas_cukuru', 'Boşluk Çukuru', 28, 7, 12, 12, 'stone_dark', 'cave', 0.15, { boss: 2 }),
  room('k_merkez_bati', 'Batı Kısayolu', 12, 15, 2, 4, 'temple', 'temple', 0.1),
  room('k_merkez_dogu', 'Doğu Kısayolu', 26, 15, 2, 4, 'temple', 'temple', 0.1),
  room('kara_hol', 'Kara Hol', 14, 15, 12, 12, 'temple', 'temple', 0.4),
  room('k_final', 'Uyanış Eşiği', 19, 14, 2, 1, 'temple', 'temple', 0),
  room('zakhar_sunagi', 'Zakhar Sunağı', 13, 0, 14, 14, 'temple', 'temple', 0.1, { boss: 3 }),
];

const R = makeRescale(OLD_RECT, ROOMS);

const DOORS: DoorDef[] = [
  door('giris', 'avlu_giris', 19, 36, 'n', 2, 'none'),
  door('avlu_giris', 'k_bati', 14, 30, 'w', 4, 'none'),
  door('k_bati', 'bati_kanadi', 9, 30, 'w', 4, 'none'),
  door('bati_kanadi', 'k_bati_kuzey', 2, 24, 'n', 4, 'none'),
  door('k_bati_kuzey', 'nefris_odasi', 2, 19, 'n', 4, 'boss_lock'),
  door('nefris_odasi', 'k_merkez_bati', 11, 15, 'e', 4, 'boss_exit'),
  door('k_merkez_bati', 'kara_hol', 13, 15, 'e', 4, 'none'),
  door('avlu_giris', 'k_dogu', 25, 30, 'e', 4, 'none'),
  door('k_dogu', 'dogu_kanadi', 30, 30, 'e', 4, 'none'),
  door('dogu_kanadi', 'k_dogu_kuzey', 34, 24, 'n', 4, 'none'),
  door('k_dogu_kuzey', 'kevvas_cukuru', 34, 19, 'n', 4, 'boss_lock'),
  door('kevvas_cukuru', 'k_merkez_dogu', 28, 15, 'w', 4, 'boss_exit'),
  door('k_merkez_dogu', 'kara_hol', 26, 15, 'w', 4, 'none'),
  door('avlu_giris', 'kara_hol', 19, 27, 'n', 2, 'none'),
  door('kara_hol', 'k_final', 19, 15, 'n', 2, 'none'),
  door('k_final', 'zakhar_sunagi', 19, 14, 'n', 2, 'boss_lock'),
];

const PACKS_RAW: PackDef[] = [
  pack('d4_p01', 'avlu_giris', 16, 30.5, 13, [['cult_acolyte', 0.3, 0], ['cult_acolyte', -0.38, 0.35], ['cult_acolyte', 0.06, -0.66], ['cult_acolyte', 0.48, 0.62], ['cult_acolyte', -0.88, -0.16], ['cult_acolyte', 0.83, -0.53], ['cult_acolyte', -0.28, 1.03], ['cult_acolyte', -0.53, -1.02], ['shadow_priest', -0.95, -0.81]]),
  pack('d4_p02', 'avlu_giris', 23, 30.5, 13, [['cult_acolyte', 0.3, 0], ['cult_acolyte', -0.38, 0.35], ['cult_acolyte', 0.06, -0.66], ['cult_acolyte', 0.48, 0.62], ['cult_acolyte', -0.88, -0.16], ['cult_acolyte', 0.83, -0.53], ['cult_acolyte', -0.28, 1.03], ['cult_acolyte', -0.53, -1.02], ['cult_summoner', 0.95, -0.81]]),
  pack('d4_p03', 'avlu_giris', 19.5, 29, 14, [['void_demon', 0, 0], ['shade', -0.45, -1.25], ['shade', 0.45, -1.25]]),
  pack('d4_p04', 'k_bati', 11, 29.5, 9, [['cult_assassin', 0.3, 0], ['cult_assassin', -0.38, 0.35], ['cult_assassin', 0.06, -0.66]]),
  pack('d4_p05', 'bati_kanadi', 3, 31, 14, [['shade', 0.36, 1.3], ['shade', 0.12, 0.43], ['shade', -0.12, -0.43], ['shadow_priest', -0.36, -1.3]]),
  pack('d4_p06', 'bati_kanadi', 6.5, 28, 13, [['shadow_spider', 0.3, 0], ['shadow_spider', -0.38, 0.35], ['shadow_spider', 0.06, -0.66], ['cult_acolyte', 0.48, 0.62], ['cult_acolyte', -0.88, -0.16], ['cult_acolyte', 0.83, -0.53], ['cult_acolyte', -0.28, 1.03]]),
  pack('d4_p07', 'bati_kanadi', 3, 25, 14, [['void_demon', 0.3, 0], ['cult_assassin', -0.38, 0.35], ['cult_assassin', 0.06, -0.66]]),
  pack('d4_p08', 'bati_kanadi', 6.5, 23.5, 14, [['cult_acolyte', 0.3, 0], ['cult_acolyte', -0.38, 0.35], ['cult_acolyte', 0.06, -0.66], ['cult_summoner', -1.68, -0.76], ['void_imp', -0.82, -1.04], ['void_imp', 0.03, -1.33], ['void_imp', 0.89, -1.61]]),
  pack('d4_p09', 'k_bati_kuzey', 4.5, 19, 9, [['cult_assassin', 0, 0], ['shade', -0.45, -1.25], ['shade', 0.45, -1.25]]),
  pack('d4_p10', 'k_dogu', 28, 29.5, 8, [['void_imp', 0, -0.7], ['void_imp', 0, -0.23], ['void_imp', 0, 0.23], ['void_imp', 0, 0.7]]),
  pack('d4_p11', 'dogu_kanadi', 36, 31, 16, [['cult_acolyte', 0.3, 0], ['cult_acolyte', -0.38, 0.35], ['cult_acolyte', 0.06, -0.66], ['cult_acolyte', 0.48, 0.62], ['cult_acolyte', -0.88, -0.16], ['cult_acolyte', 0.83, -0.53], ['shadow_priest', 1.32, -0.11], ['cult_summoner', 1.09, 0.76]]),
  pack('d4_p12', 'dogu_kanadi', 32.5, 28, 12, [['shadow_spider', 0.3, 0], ['shadow_spider', -0.38, 0.35], ['shadow_spider', 0.06, -0.66], ['shadow_spider', 0.48, 0.62]]),
  pack('d4_p13', 'dogu_kanadi', 36.5, 25, 13, [['void_demon', 0, 0], ['shadow_priest', 1, -0.75]]),
  pack('d4_p14', 'dogu_kanadi', 32.5, 23.5, 14, [['shade', -1.7, -0.71], ['shade', -1.02, -0.43], ['void_imp', -0.34, -0.14], ['void_imp', 0.34, 0.14], ['void_imp', 1.02, 0.43], ['void_imp', 1.7, 0.71]]),
  pack('d4_p15', 'k_dogu_kuzey', 34.5, 19, 8, [['void_demon', 0, 0]]),
  pack('d4_p16', 'kara_hol', 16.5, 24, 15, [['cult_acolyte', 0.3, 0], ['cult_acolyte', -0.38, 0.35], ['cult_acolyte', 0.06, -0.66], ['cult_acolyte', 0.48, 0.62], ['cult_acolyte', -0.88, -0.16], ['cult_acolyte', 0.83, -0.53], ['cult_acolyte', -0.28, 1.03], ['cult_acolyte', -0.53, -1.02], ['cult_acolyte', 1.15, 0.42], ['cult_acolyte', -1.2, 0.49], ['cult_summoner', 0.42, 1.18]]),
  pack('d4_p17', 'kara_hol', 22.5, 24, 16, [['void_demon', 0, 0], ['shadow_priest', 1.22, 0.53], ['shade', 0.6, 1.19]]),
  pack('d4_p18', 'kara_hol', 16.5, 18, 12, [['shadow_spider', 0.3, 0], ['shadow_spider', -0.38, 0.35], ['cult_assassin', 0.06, -0.66], ['cult_assassin', 0.48, 0.62]]),
  pack('d4_p19', 'kara_hol', 22.5, 18, 18, [['cult_summoner', 0.6, -2.17], ['void_imp', 0.36, -1.3], ['void_imp', 0.12, -0.43], ['void_imp', -0.12, 0.43], ['void_imp', -0.36, 1.3], ['shadow_priest', -0.6, 2.17]]),
  pack('d4_p20', 'kara_hol', 19.5, 21, 12, [['void_demon', 0.3, 0], ['cult_acolyte', -0.38, 0.35], ['cult_acolyte', 0.06, -0.66], ['cult_acolyte', 0.48, 0.62], ['cult_acolyte', -0.88, -0.16]], { patrol: [[15.5, 21], [23.5, 21]] }),
];

const PACKS: PackDef[] = PACKS_RAW.map(R.remapPack);

const bossAtNew = (id: string, roomId: string, x: number, z: number, facing: number, order: number) => {
  const [nx, nz] = R.toNew(roomId, x, z);
  return bossAt(id, roomId, nx, nz, facing, order);
};

const BOSSES = [
  bossAtNew('boss_nefris', 'nefris_odasi', 4.5, 9, 0, 1),
  bossAtNew('boss_kevvas', 'kevvas_cukuru', 34.5, 11, 0, 1),
  bossAt('boss_zakhar', 'zakhar_sunagi', 19.5, 6, 0, 3),
];

const THEME: DungeonTheme = {
  fogColor: 0x0a0514, fogNear: 5, fogFar: 28, ambient: 0x2a1a48, ambientIntensity: 0.3, hemiSky: 0x3c2470, hemiGround: 0x0a0412,
  torchColor: 0xb060ff, bloomStrength: 0.4, music: 'dungeon_shadow', palette: [0x0e0814, 0x3a1050, 0x8040ff, 0xb060ff, 0x801020], tint: 0x9080b0,
  moon: { color: 0x8040ff, intensity: 0.35 }, rim: { color: 0x7088ff, intensity: 0.35 },
};

// ---------------------------------------------------------------------------------------------------------------------
// Decoration (hand placed, GDD coordinates)
// ---------------------------------------------------------------------------------------------------------------------
const VIOLET = 0xb060ff; // temple fire
const VOID = 0x8040ff;   // void cracks, rifts
const BLOOD = 0x801020;  // blood runes
const BLOODFIRE = 0xd02848;

/**
 * Anchors of Zakhar's and Kevvas' mechanics: these lists are copies of SOCKETS / PLATFORMS / RIFT_SPOTS in ai/bosses/golge.ts
 * (GDD coordinates). The props carry the ids seal_socket_N / priest_platform_N / rift_spot_N for the scene.
 */
const SEAL_SOCKETS: [number, number][] = [[15, 6.5], [24, 6.5], [15, 11.5], [24, 11.5]];
const PRIEST_PLATFORMS: [number, number][] = [[15, 3], [24, 3], [15, 10], [24, 10]];
const RIFT_SPOTS: [number, number][] = [[32, 10], [38, 10], [35, 15]];
const START: [number, number] = [19.5, 37];
const FONT: [number, number] = [19.5, 35];
const EXIT: [number, number] = [19.5, 11];

/** Old-layout point -> new layout (the reserved circles and extras are in the new layout). */
const near = (x: number, z: number, r: number): { x: number; z: number; r: number } => {
  const [nx, nz] = R.at2(x, z);
  return { x: nx, z: nz, r };
};

const ctx = makeCtx('golge_tapinagi', DOORS, PACKS, [
  near(START[0], START[1], 2.0),
  near(FONT[0], FONT[1], 1.6),
  near(EXIT[0], EXIT[1], 2.8),
  near(4.5, 9, 4.5),      // Gozcu Nefris
  near(34.5, 11, 4.5),    // Yutucu Kevvas
  { x: 19.5, z: 6, r: 5.0 },     // Iblis Lordu Zakhar (unchanged room)
  near(25, 33, 1.5),      // Kudret Sunagi
  near(1, 33, 1.5),       // Ruzgar Sunagi
  near(38, 33, 1.5),      // gold chest
]);
const decor = decorator(ctx, rectsOf(ROOMS));
/** Room callbacks get the OLD rect and a Props whose at()/wall()/scatter() remap into the new layout. */
const D = {
  out: decor.out,
  room(id: string, fn: (p: Props, r: TileRect) => void): void {
    decor.room(id, (p) => fn(R.remapProps(p, id), oldTileRect(OLD_RECT, id)));
  },
};

/** Temple brazier: generated brazier with a coloured fire (one real light). */
const brazier = (p: Props, x: number, z: number, color = VIOLET, strong = 2.0): void => {
  p.at(gp('brazier'), x, z, { collide: true, tag: 'brazier', tint: color, emissive: color, emissiveIntensity: 0.55, light: lt(color, strong, 10, true, 1.7) });
};

/** Kenney fire basket on a short column (GDD: fire-basket scale 3, light 0xb060ff). */
const basket = (p: Props, x: number, z: number, color = VIOLET, strong = 2.0): void => {
  p.at(dg('column'), x, z, { collide: true, tag: 'brazier', tint: 0x6a5a80 });
  p.at(kg('fire-basket'), x, z, { y: 1.4, scale: 3, emissive: color, emissiveIntensity: 0.8, light: lt(color, strong, 10, true, 0.7) });
};

/** Ritual candles: one real light per cluster. */
const candles = (p: Props, x: number, z: number, color = VIOLET, strong = 0.9): void => {
  p.at(dg('candle_triple'), x, z, { light: lt(color, strong, 5, true, 0.8) });
  p.at(dg('candle_thin_lit'), x + 0.2, z + 0.12);
  p.at(dg('candle_melted'), x - 0.18, z + 0.14, { rot: p.rnd(0, 360) });
};

/** Altar + floating crystal + a half ring of candles that stays inside the room (GDD 1.4 shrines). */
const shrine = (p: Props, r: TileRect, x: number, z: number, crystal: 'crystal_blue' | 'crystal_purple', color: number, id: string, scale = 3): void => {
  p.at(kg('altar-stone'), x, z, { scale, collide: true, id, tag: 'shrine', tint: 0x6a5a80 });
  p.at(gp(crystal), x, z, { y: 1.9, scale: 0.5, emissive: color, light: lt(color, 1.7, 7, true, 0.7), id: `${id}_crystal` });
  const inner = Props.inner(r, 0.45);
  for (let i = 0; i < 6; i++) {
    const a = ((30 + i * 60) * Math.PI) / 180;
    const cx = x + Math.sin(a) * 0.85, cz = z + Math.cos(a) * 0.85;
    if (cx < inner.x0 || cx > inner.x1 || cz < inner.z0 || cz > inner.z1) continue;
    p.at(dg('candle_lit'), cx, cz, { rot: (a * 180) / Math.PI });
  }
};

const bones = (p: Props, n: number, area: { x0: number; z0: number; x1: number; z1: number }, extra: string[] = []): void => {
  p.scatter(n, [hw('bone_A'), hw('bone_B'), hw('bone_C'), hw('skull'), hw('skull_candle'), ...extra], area, {}, { minDist: 0.8 });
};

// ---- giris: Muhurlu Kapi (start room) -------------------------------------------------------------------------------
D.room('giris', (p, r) => {
  p.at(gp('font_of_power'), FONT[0], FONT[1], { collide: true, id: 'font_of_power', tag: 'socket', light: lt(VIOLET, 2.2, 12, false, 2.0) });
  p.at(dg('stairs_walled'), 19.5, 37.9, { id: 'stairs_up' });                                    // the way back up (decorative)
  basket(p, 17.5, 34.4); basket(p, 21.5, 34.4);                                                   // 2 purple braziers
  p.wall(r, 'n', [17.3, 21.7], dg('banner_patternC_brown'), { tint: 0xa060e0 });
  p.wall(r, 's', [17.4, 21.6], dg('banner_patternC_brown'), { tint: 0xa060e0 });
  p.at(hw('plaque_candles'), 17.15, 37.4, { rot: 90 });                                           // memorials of the lost delvers
  p.at(hw('plaque_candles'), 21.85, 37.4, { rot: -90 });
  p.torches(r, 'w', [35.2], VIOLET).torches(r, 'e', [35.2], VIOLET);
  for (const [x, z] of [[18.2, 36.0], [20.8, 36.0], [18.0, 38.0], [21.0, 38.0]] as [number, number][]) candles(p, x, z, VIOLET, 0.7);
  p.at(gp('chains_hanging'), 17.6, 36.6, { y: 4 }).at(gp('chains_hanging'), 21.4, 36.6, { y: 4 });
  p.at(hw('skull_candle'), 16.9, 34.2, { rot: 60 }).at(hw('skull_candle'), 22.1, 38.1, { rot: -120 });
  bones(p, 6, Props.inner(r, 0.7));
});

// ---- avlu_giris: Muhurlu Avlu (courtyard) --------------------------------------------------------------------------
D.room('avlu_giris', (p, r) => {
  // six column-large: four along the north wall around the Kara Hol door, two by the south corners
  for (const x of [15.2, 17.0, 22.0, 23.8]) p.at(kg('column-large'), x, 27.15, { scale: 3, collide: true, tag: 'pillar', tint: 0x7a6a90 });
  for (const x of [14.6, 24.4]) p.at(kg('column-large'), x, 33.0, { scale: 3, collide: true, tag: 'pillar', tint: 0x7a6a90 });
  // four obelisks around the shadow pool
  for (const [x, z] of [[17.7, 30.2], [21.3, 30.2], [17.7, 32.2], [21.3, 32.2]] as [number, number][]) {
    p.at(kg('pillar-obelisk'), x, z, { scale: 3, collide: true, tint: 0x5a4a78, emissive: VOID, emissiveIntensity: 0.35 });
  }
  // two stone altars flanking the nave door
  p.at(kg('altar-stone'), 16.7, 27.7, { scale: 2.8, collide: true, rot: 0, tint: 0x6a5a80, id: 'altar_w' });
  p.at(kg('altar-stone'), 22.3, 27.7, { scale: 2.8, collide: true, rot: 0, tint: 0x6a5a80, id: 'altar_e' });
  candles(p, 16.7, 27.0, VIOLET, 1.0); candles(p, 22.3, 27.0, VIOLET, 1.0);
  // ritual candles in a loose ring around the pool
  p.ring(dg('candle_triple'), 19.5, 31.0, 1.95, 8, { light: lt(VIOLET, 0.6, 4, true, 0.8) }, 'out', 22);
  p.at(hw('skull_candle'), 14.4, 31.8, { rot: 80 }).at(hw('skull_candle'), 24.6, 29.4, { rot: -100 }).at(hw('ribcage'), 14.6, 27.5, { rot: 30 });
  p.torches(r, 'n', [15.9, 23.1], VIOLET).torches(r, 's', [15.8, 23.2], VIOLET).torches(r, 'w', [27.4, 32.6], VIOLET).torches(r, 'e', [27.4, 31.8], VIOLET);
  p.wall(r, 'n', [14.5, 24.5], dg('banner_patternC_brown'), { tint: 0xa060e0 }).wall(r, 's', [14.7, 24.3], dg('banner_patternB_brown'), { tint: 0xa060e0 });
  shrine(p, r, 25, 33, 'crystal_purple', VIOLET, 'shrine_power_1', 2.7);                          // Kudret Sunagi (SE corner)
  p.at(gp('chains_hanging'), 18.2, 29.4, { y: 4 }).at(gp('chains_hanging'), 20.8, 29.4, { y: 4 }).at(gp('chains_hanging'), 19.5, 32.4, { y: 4 });
  p.at(dg('rubble_half'), 14.3, 29.2, { scale: 0.6, rot: 90 });
  bones(p, 9, Props.inner(r, 0.9), [dg('candle_melted')]);
});

// ---- k_bati: Fisilti Koridoru (dark corridor, assassins wait here) ------------------------------------------------
D.room('k_bati', (p, r) => {
  p.at(dg('candle_melted'), 10.0, 28.9).at(dg('candle_melted'), 12.6, 30.1, { rot: 70 }).at(hw('candle_melted'), 11.4, 29.0, { rot: 20 });
  p.at(dg('candle_thin_lit'), 9.4, 30.0, { light: lt(VIOLET, 0.6, 4, true, 1.0) });                // the only light: halved radius
  p.at(hw('skull'), 12.2, 28.8, { rot: 150 }).at(hw('bone_B'), 10.6, 30.2, { rot: 40 });
  p.wall(r, 'n', [9.8, 12.8], dg('banner_thin_brown'), { tint: 0x8a50c0 }).wall(r, 's', [10.2], dg('banner_thin_brown'), { tint: 0x8a50c0 });
  p.at(gp('chains_hanging'), 11.0, 29.0, { y: 4 }).at(gp('chains_hanging'), 12.4, 30.0, { y: 4 });
});

// ---- bati_kanadi: Fisilti Kanadi (cult dormitory) -------------------------------------------------------------------
D.room('bati_kanadi', (p, r) => {
  // six beds in a row along the west wall (tinted dark), a stool at each foot
  [22.7, 23.8, 24.9, 26.0, 27.1, 28.2].forEach((z, i) => {
    p.at(fu('bed_single_A'), 1.15, z, { collide: true, rot: 0, tint: 0x5a4a6a });
    if (i % 2 === 0) p.at(fu('chair_stool'), 2.0, z + 0.2, { rot: p.rnd(0, 360), tint: 0x5a4a6a });
  });
  p.at(fu('cabinet_small_decorated'), 1.2, 21.95, { collide: true, tint: 0x5a4a6a }).at(fu('book_set'), 1.2, 21.95, { y: 1.62, rot: 10 });
  p.at(fu('shelf_B_small_decorated'), 8.0, 21.85, { collide: true, tint: 0x5a4a6a });
  p.at(fu('rug_oval_B'), 4.6, 26.4, { tint: 0x6a3a9a });
  for (const [x, z] of [[2.4, 22.6], [2.4, 27.6], [7.8, 24.6]] as [number, number][]) {
    p.at(fu('lamp_standing'), x, z, { collide: true, tint: 0x6a5a80, light: lt(VIOLET, 1.3, 8, true, 2.2) });
  }
  shrine(p, r, 1, 33, 'crystal_blue', 0x60a0ff, 'shrine_haste_1', 2.6);                           // Ruzgar Sunagi (SW corner)
  p.torches(r, 'w', [30.4], VIOLET).torches(r, 'n', [2.2, 7.0], VIOLET).torches(r, 's', [3.0, 6.0], VIOLET).torches(r, 'e', [26.0, 32.0], VIOLET);
  p.wall(r, 'n', [6.7], dg('banner_thin_brown'), { tint: 0x8a50c0 }).wall(r, 's', [4.5], dg('banner_patternB_brown'), { tint: 0x8a50c0 });
  p.at(dg('candle_triple'), 4.2, 31.6, { light: lt(VIOLET, 0.8, 5, true, 0.8) }).at(hw('skull_candle'), 7.7, 31.8, { rot: 200 });
  p.at(gp('chains_hanging'), 4.5, 24.2, { y: 4 }).at(gp('chains_hanging'), 6.0, 30.6, { y: 4 });
  p.at(dg('barrel_small'), 8.0, 32.9, { collide: true, tag: 'breakable' });
  bones(p, 5, Props.inner(r, 1.0));
});

// ---- k_bati_kuzey: Gozcu Merdiveni ---------------------------------------------------------------------------------
D.room('k_bati_kuzey', (p, r) => {
  p.at(dg('stairs_walled'), 4.5, 21.0, { rot: 180, id: 'watcher_stairs' });
  p.wall(r, 'w', [18.0, 20.2], dg('banner_thin_brown'), { tint: 0x8a50c0 }).wall(r, 'e', [18.0, 20.2], dg('banner_thin_brown'), { tint: 0x8a50c0 });
  p.torches(r, 'w', [19.1], VIOLET).torches(r, 'e', [19.1], VIOLET);
  p.at(dg('candle_melted'), 3.9, 20.6).at(hw('skull'), 5.0, 17.6, { rot: 100 });
});

// ---- nefris_odasi: Boss 1 arena (Gozcu Nefris) -----------------------------------------------------------------------
D.room('nefris_odasi', (p, r) => {
  // six columns: clones hide behind them
  for (const z of [8, 11, 14]) for (const x of [2.5, 7.5]) p.at(dg('column'), x, z, { scale: 2.2, collide: true, tag: 'pillar', tint: 0x6a5a80 });
  // watchers on the north wall
  p.at(gp('statue_hooded'), 1.8, 6.4, { rot: 160, collide: true, tint: 0x5a4a78 }).at(gp('statue_hooded'), 7.2, 6.4, { rot: -160, collide: true, tint: 0x5a4a78 });
  // the cage with its chain (hanging lantern cage), dim purple lights
  p.at(gp('iron_cage'), 0.95, 6.95, { collide: true, rot: 20, tint: 0x504060 }).at(gp('chains_hanging'), 0.95, 6.95, { y: 4 });
  p.at(hw('lantern_hanging'), 2.5, 9.5, { y: 3.95, light: lt(VIOLET, 1.1, 9, true, -0.8) });
  p.at(hw('lantern_hanging'), 7.5, 12.5, { y: 3.95, light: lt(VIOLET, 1.1, 9, true, -0.8) });
  p.at(hw('lantern_hanging'), 5.0, 6.8, { y: 3.95, light: lt(BLOODFIRE, 0.9, 8, true, -0.8) });
  p.wall(r, 'n', [4.5], dg('banner_patternC_brown'), { tint: 0xa060e0 }).wall(r, 'n', [3.0, 6.0], dg('banner_thin_brown'), { tint: 0x8a50c0 });
  p.wall(r, 'w', [8.0, 13.5], dg('banner_patternB_brown'), { tint: 0x8a50c0 }).wall(r, 'e', [7.4, 12.0], dg('banner_patternB_brown'), { tint: 0x8a50c0 });
  p.torches(r, 'n', [1.5, 7.5], VIOLET).torches(r, 'w', [10.5, 15.5], VIOLET).torches(r, 'e', [9.5, 15.5], VIOLET).torches(r, 's', [1.4, 7.8], VIOLET);
  // daggers of the cult: dropped shields, blood and bones where victims fell
  p.at(dg('sword_shield_broken'), 0.2, 12.4, { y: 2.2, rot: 90 }).at(dg('sword_shield_broken'), 9.0, 9.6, { y: 2.2, rot: -90 });
  p.at(gp('bone_pile'), 8.4, 7.0, { rot: 30 }).at(hw('ribcage'), 1.4, 15.4, { rot: 70 }).at(hw('skull'), 8.8, 15.6, { rot: 200 });
  p.at(dg('rubble_half'), 8.6, 16.0, { rot: 160, scale: 0.7 }).at(dg('floor_tile_small_broken_A'), 3.6, 12.6).at(dg('floor_tile_small_broken_A'), 5.8, 10.4, { rot: 90 });
  candles(p, 1.2, 10.6, BLOODFIRE, 0.8); candles(p, 8.8, 11.4, BLOODFIRE, 0.8);
});

// ---- k_dogu: Ayin Koridoru (blood runes, skull candles) ---------------------------------------------------------------
D.room('k_dogu', (p, r) => {
  for (const [x, z] of [[26.2, 29.0], [27.3, 30.2], [28.9, 28.9], [30.0, 30.1], [29.3, 29.9]] as [number, number][]) {
    p.at(hw('skull_candle'), x, z, { rot: p.rnd(0, 360), light: lt(BLOODFIRE, 0.55, 3.5, true, 0.6) });
  }
  p.at(dg('candle_melted'), 27.6, 29.2).at(hw('bone_A'), 26.8, 30.0, { rot: 110 }).at(hw('bone_C'), 29.6, 29.2, { rot: 30 });
  p.wall(r, 'n', [26.7, 29.5], dg('banner_thin_brown'), { tint: 0x8a2030 }).wall(r, 's', [28.0], dg('banner_thin_brown'), { tint: 0x8a2030 });
  p.at(gp('chains_hanging'), 27.0, 29.6, { y: 4 }).at(gp('chains_hanging'), 29.4, 29.4, { y: 4 });
});

// ---- dogu_kanadi: Ayin Kanadi (ritual wing) ----------------------------------------------------------------------------
D.room('dogu_kanadi', (p, r) => {
  // the summoning circle: wooden altar in the middle, three old coffins on its rim
  p.at(kg('altar-wood'), 35, 27.5, { scale: 3, collide: true, id: 'ritual_altar', tint: 0x6a4a60, emissive: BLOOD, emissiveIntensity: 0.45, light: lt(BLOODFIRE, 1.6, 10, true, 1.6) });
  p.at(dg('candle_triple'), 34.5, 27.5, { y: 1.65, scale: 0.9 }).at(kg('detail-chalice'), 35.5, 27.5, { y: 1.6, scale: 3, emissive: BLOOD });
  p.at(kg('coffin-old'), 35, 29.5, { scale: 3, collide: true, rot: 0, tint: 0x6a5a70 });
  p.at(kg('coffin-old'), 33.3, 25.8, { scale: 3, collide: true, rot: -25, tint: 0x6a5a70 });
  p.at(kg('coffin-old'), 37.0, 27.3, { scale: 3, collide: true, rot: 25, tint: 0x6a5a70 });
  // six urns along the walls
  for (const [x, z] of [[31.1, 24.9], [31.1, 26.9], [31.1, 32.9], [38.0, 22.5], [38.0, 28.3], [38.0, 29.9]] as [number, number][]) {
    p.at(kg('urn-round'), x, z, { scale: 3, collide: true, tint: 0x6a5a80 });
  }
  p.at(hw('shrine_candles'), 31.2, 22.4, { rot: 135, collide: true }).at(hw('shrine_candles'), 38.0, 32.2, { rot: -135, collide: true });
  p.at(gp('chest_gold'), 38.0, 33.0, { rot: -90, collide: true, id: 'chest_ritual', tag: 'chest' });
  p.ring(dg('candle_lit'), 35, 27.5, 1.05, 8, {}, 'out', 22);
  p.torches(r, 'n', [32.2, 36.8], BLOODFIRE).torches(r, 's', [32.0, 37.4], BLOODFIRE).torches(r, 'w', [23.0, 31.4], BLOODFIRE).torches(r, 'e', [24.0, 31.4], BLOODFIRE);
  p.wall(r, 'n', [34.0], dg('banner_patternC_brown'), { tint: 0x8a2030 }).wall(r, 'n', [31.4, 38.0], dg('banner_thin_brown'), { tint: 0x8a2030 });
  p.at(gp('chains_hanging'), 35.0, 25.4, { y: 4 }).at(gp('chains_hanging'), 33.6, 29.3, { y: 4 }).at(gp('chains_hanging'), 36.6, 29.0, { y: 4 });
  p.at(gp('bone_pile'), 31.3, 30.4, { rot: 40 }).at(hw('ribcage'), 37.8, 24.6, { rot: -40 }).at(hw('skull'), 31.2, 29.2, { rot: 80 });
  bones(p, 6, Props.inner(r, 1.0));
});

// ---- k_dogu_kuzey: Cukur Merdiveni --------------------------------------------------------------------------------------
D.room('k_dogu_kuzey', (p, r) => {
  p.at(dg('stairs_narrow'), 34.5, 20.9, { rot: 180, id: 'pit_stairs' });                           // steps leading down (visual)
  p.torches(r, 'w', [19.2], VOID).torches(r, 'e', [19.2], VOID);
  p.at(dg('candle_melted'), 33.9, 20.5).at(hw('bone_A'), 35.0, 17.7, { rot: 60 });
  p.at(dg('candle_thin_lit'), 35.1, 20.6, { light: lt(VOID, 0.7, 5, true, 1.0) });
});

// ---- kevvas_cukuru: Boss 2 arena (Yutucu Kevvas), the void pit ----------------------------------------------------------
D.room('kevvas_cukuru', (p, r) => {
  // violet crystals fringing the pit
  for (let i = 0; i < 6; i++) {
    const a = ((i * 60 + 15) * Math.PI) / 180;
    p.at(gp('crystal_purple'), 35 + Math.sin(a) * 1.05, 7.5 + Math.cos(a) * 1.05, { scale: 0.45 + (i % 3) * 0.12, rot: i * 47, emissive: VOID, emissiveIntensity: 0.9, ...(i % 2 ? { light: lt(VOID, 1.4, 9, true, 0.8) } : {}) });
  }
  p.at(dg('floor_tile_extralarge_grates_open'), 35, 7.5, { y: 0.02, vfx: 'portal_swirl', id: 'void_pit' });
  // broken pillars
  for (const [x, z, rot] of [[31.6, 8.4, 20], [38.4, 8.4, 160], [31.4, 13.6, 70], [38.6, 14.0, 250]] as [number, number, number][]) {
    p.at(gp('pillar_broken'), x, z, { rot, collide: true, tint: 0x6a5a80 });
  }
  p.at(dg('rubble_large'), 36.9, 6.3, { scale: 0.4, rot: 200, collide: true }).at(dg('rubble_large'), 32.9, 6.4, { scale: 0.4, rot: 20, collide: true });
  p.at(dg('rubble_half'), 30.5, 11.0, { rot: 90, scale: 0.8 }).at(dg('rubble_half'), 39.0, 11.4, { rot: -90, scale: 0.8 });
  // rift spawn spots (3): small violet obelisks mark the ground
  for (const [i, [x, z]] of RIFT_SPOTS.entries()) {
    p.at(kg('pillar-obelisk'), x, z, { scale: 2.0, tag: 'rift', id: `rift_spot_${i + 1}`, tint: 0x5a4a78, emissive: VOID, emissiveIntensity: 0.6, light: lt(VOID, 1.0, 6, true, 1.0) });
  }
  p.torches(r, 'n', [31.2, 38.8], VOID).torches(r, 'w', [8.0, 12.5], VOID).torches(r, 'e', [8.0, 12.5], VOID).torches(r, 's', [31.0, 38.4], VOID);
  p.at(gp('bone_pile'), 30.8, 15.8, { rot: 30 }).at(gp('bone_pile'), 38.9, 6.6, { rot: 170 }).at(hw('ribcage'), 37.2, 15.6, { rot: 100 }).at(hw('skull'), 31.0, 7.2, { rot: 20 });
  p.at(gp('rock_small'), 30.6, 6.5, { scale: 1.4, rot: 40 }).at(gp('rock_small'), 39.0, 15.9, { scale: 1.3, rot: 190 }).at(gp('rock_medium'), 30.7, 13.0, { rot: 100, collide: true });
});

// ---- k_merkez_bati / k_merkez_dogu: shortcuts (sealed until the wing boss dies, the builder owns the gates) ---------
D.room('k_merkez_bati', (p, r) => {
  p.at(gp('crystal_purple'), 10.4, 15.1, { scale: 0.4, emissive: VOID, light: lt(VOID, 1.1, 7, true, 0.7) });
  p.at(dg('candle_melted'), 11.8, 16.0).at(hw('bone_A'), 12.6, 15.4, { rot: 30 }).at(hw('skull'), 10.4, 16.0, { rot: 220 });
  p.torches(r, 'n', [12.0], VOID).torches(r, 's', [11.5], VOID);
});
D.room('k_merkez_dogu', (p, r) => {
  p.at(gp('crystal_purple'), 29.6, 15.1, { scale: 0.4, emissive: VOID, light: lt(VOID, 1.1, 7, true, 0.7) });
  p.at(dg('candle_melted'), 27.8, 16.0).at(hw('bone_B'), 26.8, 15.4, { rot: 130 }).at(hw('skull'), 29.4, 16.0, { rot: 40 });
  p.torches(r, 'n', [28.0], VOID).torches(r, 's', [27.5], VOID);
});

// ---- kara_hol: the Black Nave ----------------------------------------------------------------------------------------------
D.room('kara_hol', (p, r) => {
  // two rows of column-large (x = 15.5 / 23.5, z = 17, 20, 23)
  for (const z of [17, 20, 23]) for (const x of [15.5, 23.5]) p.at(kg('column-large'), x, z, { scale: 3, collide: true, tag: 'pillar', tint: 0x7a6a90 });
  // low brick partitions form an entrance channel (x 18.1 / 20.9) south of the patrol line
  // (the brick-wall mesh is not centred on its origin: rot -90 / 90 shifts the body 1 m toward the aisle)
  p.row(kg('brick-wall'), 18.1, 23.1, 18.1, 25.35, 4, { scale: 3, rot: -90, collide: true, tint: 0x5a4a70 });
  p.row(kg('brick-wall'), 20.9, 23.1, 20.9, 25.35, 4, { scale: 3, rot: 90, collide: true, tint: 0x5a4a70 });
  // the demon lord statue guards the Uyanis Esigi door (frozen first frame of Idle; the builder measures its collider from the
  // posed body: about 4.1 x 2.0 m at scale 1.5, not the 5.4 m wide bind box)
  p.at(mon('Demon_Lord'), 19.5, 16.5, { scale: 1.5, rot: 0, pose: 'Idle', tint: 0x302040, collide: true, id: 'demon_statue', emissive: VOID, emissiveIntensity: 0.25 });
  // 8 purple braziers
  for (const [x, z] of [[14.3, 15.4], [24.7, 15.4], [14.3, 20.5], [24.7, 20.5], [14.3, 25.7], [24.7, 25.7], [17.4, 15.3], [21.6, 15.3]] as [number, number][]) brazier(p, x, z);
  p.torches(r, 'w', [17.4, 23.0], VIOLET).torches(r, 'e', [17.4, 23.0], VIOLET).torches(r, 's', [14.6, 24.4], VIOLET).torches(r, 'n', [16.2, 22.8], VIOLET);
  p.wall(r, 'w', [18.8, 25.2], dg('banner_patternC_brown'), { tint: 0xa060e0 }).wall(r, 'e', [18.8, 25.2], dg('banner_patternC_brown'), { tint: 0xa060e0 });
  p.wall(r, 'n', [15.2, 23.8], dg('banner_triple_brown'), { tint: 0x8a50c0 });
  for (const [x, z] of [[17.0, 21.8], [22.0, 21.8], [19.5, 19.1]] as [number, number][]) candles(p, x, z, VIOLET, 0.8);
  p.at(gp('chains_hanging'), 17.5, 21.2, { y: 4 }).at(gp('chains_hanging'), 21.5, 21.2, { y: 4 }).at(gp('chains_hanging'), 19.5, 24.8, { y: 4 });
  p.at(dg('rubble_large'), 25.1, 18.9, { scale: 0.4, rot: 40, collide: true }).at(dg('rubble_half'), 13.9, 22.3, { rot: 90, scale: 0.8 });
  p.at(gp('bone_pile'), 14.4, 17.0, { rot: 30 }).at(hw('ribcage'), 24.5, 23.6, { rot: -60 }).at(hw('skull'), 14.6, 24.0, { rot: 100 });
  bones(p, 10, Props.inner(r, 1.0));
});

// ---- k_final: Uyanis Esigi (seal door, both wing bosses must be dead) --------------------------------------------------------
D.room('k_final', (p, r) => {
  p.torches(r, 'w', [14.0], VOID).torches(r, 'e', [14.0], VOID);
  p.at(hw('candle_melted'), 18.9, 14.15).at(hw('candle_melted'), 20.1, 13.85, { rot: 80 });
});

// ---- zakhar_sunagi: Boss 3 arena (Iblis Lordu Zakhar) ------------------------------------------------------------------------
D.room('zakhar_sunagi', (p, r) => {
  // the altar and the giant rift behind it
  p.at(kg('altar-stone'), 19.5, 1.5, { scale: 4, collide: true, id: 'zakhar_altar', tint: 0x5a4a78, emissive: BLOOD, emissiveIntensity: 0.3 });
  p.at(gp('crystal_purple'), 19.5, 0.1, { scale: 1.5, emissive: VOID, emissiveIntensity: 1.1, vfx: 'portal_swirl', id: 'rift_giant', light: lt(VOID, 2.6, 16, true, 2.4) });
  p.at(gp('crystal_purple'), 17.0, 0.2, { scale: 0.9, rot: 60, emissive: VOID, emissiveIntensity: 0.9 }).at(gp('crystal_purple'), 22.0, 0.2, { scale: 0.9, rot: 200, emissive: VOID, emissiveIntensity: 0.9 });
  p.at(hw('shrine_candles'), 17.9, 2.2, { rot: 30, collide: true }).at(hw('shrine_candles'), 21.1, 2.2, { rot: -30, collide: true });
  // four priest platforms: 2x2 foundation blocks (2 m high); the ritualists of phase 2 stand on top
  const platform = (cx: number, cz: number, id: string): void => {
    for (const dx of [-0.275, 0.275]) for (const dz of [-0.275, 0.275]) p.at(dg('floor_foundation_allsides'), cx + dx, cz + dz, { collide: true, tint: 0x5a4a78 });
    p.at(dg('candle_triple'), cx, cz, { y: 2.0, id, tag: 'socket', light: lt(VOID, 1.2, 7, true, 0.9) });
  };
  PRIEST_PLATFORMS.forEach(([x, z], i) => platform(x, z, `priest_platform_${i + 1}`));
  // four seal sockets (Golge Muhurleri): obelisk + rune. Positions are the SOCKETS of ai/bosses/golge.ts (the boss script picks
  // 1-3 of them at random for the soak circles), so keep the two lists identical.
  for (const [i, [x, z]] of SEAL_SOCKETS.entries()) {
    p.at(kg('pillar-obelisk'), x, z, { scale: 2.4, tag: 'socket', id: `seal_socket_${i + 1}`, tint: 0x5a4a78, emissive: BLOOD, emissiveIntensity: 0.7, light: lt(BLOODFIRE, 1.2, 7, true, 1.2) });
  }
  // ten braziers, purple and blood red
  const bz: [number, number][] = [[13.4, 1.0], [25.6, 1.0], [13.4, 6.5], [25.6, 6.5], [13.4, 12.3], [25.6, 12.3], [17.4, 12.8], [21.6, 12.8], [16.8, 1.2], [22.2, 1.2]];
  bz.forEach(([x, z], i) => brazier(p, x, z, i % 2 ? BLOODFIRE : VIOLET, 2.2));
  p.torches(r, 'w', [3.8, 8.6, 11.0], VIOLET).torches(r, 'e', [3.8, 8.6, 11.0], VIOLET).torches(r, 's', [14.4, 24.6], BLOODFIRE).torches(r, 'n', [14.4, 24.6], VIOLET);
  p.wall(r, 'n', [17.0, 22.0], dg('banner_patternC_brown'), { tint: 0xa060e0 }).wall(r, 'w', [2.0, 12.4], dg('banner_triple_brown'), { tint: 0x8a2030 }).wall(r, 'e', [2.0, 12.4], dg('banner_triple_brown'), { tint: 0x8a2030 });
  p.wall(r, 's', [13.6, 25.4], dg('banner_patternB_brown'), { tint: 0x8a50c0 });
  p.at(gp('chains_hanging'), 17.5, 4.6, { y: 4 }).at(gp('chains_hanging'), 21.5, 4.6, { y: 4 }).at(gp('chains_hanging'), 19.5, 8.4, { y: 4 }).at(gp('chains_hanging'), 17.3, 6.8, { y: 4 }).at(gp('chains_hanging'), 21.7, 6.8, { y: 4 });
  p.at(gp('bone_pile'), 13.4, 3.5, { rot: 40 }).at(gp('bone_pile'), 25.6, 9.0, { rot: 200 }).at(hw('ribcage'), 25.4, 3.4, { rot: -50 }).at(hw('skull'), 13.6, 9.4, { rot: 100 });
  p.at(dg('rubble_large'), 25.7, 13.0, { scale: 0.4, rot: 200 }).at(dg('rubble_half'), 13.3, 13.0, { scale: 0.7, rot: 20 });
  bones(p, 8, Props.inner(r, 1.2));
});

// ---------------------------------------------------------------------------------------------------------------------
// Zones, per-room extras, pack flags, assembly
// ---------------------------------------------------------------------------------------------------------------------
const sealRune = (x: number, z: number, r: number, glow = VOID, color = 0x14061c, intensity = 0.9): ZoneDef => circleZone('rune', x, z, r, { color, glow, glowIntensity: intensity });

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET, zones: [sealRune(...R.at2(FONT[0], FONT[1]), 1.7, VIOLET)] },
  avlu_giris: {
    explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    zones: [circleZone('pool', ...R.at2(19.5, 31), 1.7, { color: 0x050308, glow: VOID, glowIntensity: 0.8, vfx: 'ambient_shadow_wisps' })],
  },
  k_bati: { ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET },
  bati_kanadi: { ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET },
  k_bati_kuzey: { ambientVfx: 'ambient_shadow_wisps' },
  nefris_odasi: { explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET, zones: [sealRune(...R.at2(4.5, 9), 3.0, BLOOD, 0x14060c, 0.7)] },
  k_dogu: {
    ambientVfx: 'ambient_shadow_wisps', lightColor: BLOODFIRE,
    zones: [sealRune(...R.at2(27, 29.5), 0.95, BLOOD, 0x14060c, 1.2), sealRune(...R.at2(29.3, 29.5), 0.95, BLOOD, 0x14060c, 1.2), rectZone('rune', 26, 30, 5, 4, { color: 0x14060c, glow: BLOOD, glowIntensity: 0.35 })],
  },
  dogu_kanadi: { ambientVfx: 'ambient_shadow_wisps', lightColor: BLOODFIRE, zones: [sealRune(...R.at2(35, 27.5), 0.75, BLOOD, 0x14060c, 1.4), sealRune(...R.at2(35, 27.5), 1.25, BLOOD, 0x14060c, 0.5)] },
  k_dogu_kuzey: {
    ambientVfx: 'ambient_shadow_wisps',
    // the two rune strips run along the corridor's walls (the corridor is 4 wide now)
    zones: [rectZone('rune', 33.6, 19, 0.25, 5, { color: 0x0c0614, glow: VOID, glowIntensity: 1.0 }), rectZone('rune', 36.9, 19, 0.25, 5, { color: 0x0c0614, glow: VOID, glowIntensity: 1.0 })],
  },
  kevvas_cukuru: {
    explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VOID,
    zones: [
      circleZone('void', ...R.at2(35, 7.5), 0.75, { blocked: true, color: 0x000000, glow: VOID, glowIntensity: 1.6, vfx: 'portal_swirl' }),
      ...RIFT_SPOTS.map(([x, z]) => sealRune(...R.at2(x, z), 0.75)),
    ],
  },
  k_merkez_bati: { ambientVfx: 'ambient_shadow_wisps' },
  k_merkez_dogu: { ambientVfx: 'ambient_shadow_wisps' },
  kara_hol: {
    explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    zones: [sealRune(19.5, 21, 2.2, BLOOD, 0x14060c, 0.6)],
  },
  k_final: { ambientVfx: 'ambient_shadow_wisps', lightColor: VOID, zones: [sealRune(19.5, 14, 0.95, VOID, 0x0c0614, 1.2)] },
  zakhar_sunagi: {
    explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    zones: [
      sealRune(19.5, 6.5, 5.5, BLOOD, 0x14060c, 0.55),
      ...SEAL_SOCKETS.map(([x, z]) => sealRune(x, z, 0.65, BLOOD, 0x14060c, 1.2)),
    ],
  },
};

/** Design flags (GDD 4.4.4). Assassins hide in stealth (opening hit coef 2.5, AoE reveals). */
const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  d4_p01: { big: true, note: 'Courtyard big pull: p01 + p02 + the void demon of p03 = 23 enemies (10 m apart).' },
  d4_p02: { big: true },
  d4_p03: { note: 'Stands in front of the Kara Hol door; link risk with p01/p02 if pulled carelessly.' },
  d4_p04: { stealth: true, note: 'Assassins wait in stealth in the dark corridor.' },
  d4_p07: { note: 'Two assassins hide in stealth next to the void demon.' },
  d4_p16: { big: true, note: 'Eleven acolytes: Fanatik rewards killing them all at once.' },
  d4_p18: { note: 'Skippable in route B.' },
  d4_p20: { big: true, note: 'Patrol crosses the nave W-E between the four packs. Skippable in route B.' },
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(...R.at2(19.5, 35)),
  shrines: [{ type: 'shrine_haste', pos: pt(...R.at2(1, 33)) }, { type: 'shrine_power', pos: pt(...R.at2(25, 33)) }],
  riftSpots: ([[19.5, 31], [4.5, 27], [35, 27], [19.5, 21], [12, 29.5], [28, 29.5]] as [number, number][]).map(([x, z]) => pt(...R.at2(x, z))),
  chests: [{ pos: pt(...R.at2(38, 33)), kind: 'chest_gold' }],
};

export const GOLGE_TAPINAGI: DungeonDef = {
  id: 'golge_tapinagi',
  name: 'Gölge Tapınağı',
  shortName: 'Tapınak',
  lore: 'Gölge Tarikatı, yüzyıllardır mühürlü olan tapınağı yeniden açtı. Müritler gece gündüz ayin yapıyor; amaçları, tapınağın derinliklerinde uyuyan İblis Lordu Zakhar\'ı uyandırmak. Gözcü Nefris gölgelerden izler, Yutucu Kevvas boşluk çukurunda açlıkla bekler. Mühürler zayıflıyor. Zaman daralıyor.',
  levelRange: [42, 52],
  timerSec: 910,
  forcesRequired: 210,
  theme: THEME,
  grid: { w: 40, h: 42 },
  rooms: withProps(ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })), D.out),
  doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)),
  bosses: BOSSES,
  start: { pos: shPt(...R.at2(START[0], START[1])), facing: 180 },
  exit: { pos: shPt(...R.at2(EXIT[0], EXIT[1])) },
  extras: EXTRAS,
};

