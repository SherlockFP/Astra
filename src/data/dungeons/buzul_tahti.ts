import type { DoorDef, DungeonDef, DungeonTheme, PackDef, RoomDef, ZoneDef } from '../../types/dungeons';
import {
  GRID_SHIFT, MOUNT_Y, Props, bossAt, circleZone, decorator, door, dg, fu, gp, hw, kf, kg, ks, lt, makeCtx, pack, rectZone, rectsOf, pt, room, shPt, skl, chr, tw, withProps,
} from './kit';
import { makeRescale, type Rect4 } from './rescale';

/**
 * BUZUL TAHTI (frost throne) - GDD_CONTENT 4.3. Level 30-40, M+ 14:00, 250 forces (309 available).
 * Layout (rooms / doors / packs / bosses) is generated from docs/GDD_CONTENT.layout.json; decoration is hand placed.
 * Positions are written in GDD coordinates (see the COORDINATES note in kit.ts).
 */

// ---- GENERATED from docs/GDD_CONTENT.layout.json (rooms, doors, packs, bosses) ----
// SCALE PASS: corridors widened to 4 (secret / side passages stay 2), pull rooms >= 9 short side, boss arenas 12x12.
// OLD_RECT keeps the pre-pass rects; hand placed content is written in those coordinates and remapped by rescale.ts.
const OLD_RECT: Record<string, Rect4> = {
  giris: [17, 34, 6, 5], k_giris: [19, 29, 2, 5], buz_avlusu: [12, 17, 16, 12], k_bati: [8, 21, 4, 2], yeti_magarasi: [0, 15, 8, 11],
  k_kuzeybati: [3, 10, 2, 5], buz_kutuphane: [0, 0, 10, 10], k_kuzey: [10, 4, 5, 2], merdiven: [19, 10, 2, 7], cadi_kulesi: [15, 0, 10, 10],
  k_dogu: [25, 4, 4, 2], kristal_galeri: [29, 0, 10, 11], k_guneydogu: [33, 11, 2, 4], sovalye_salonu: [29, 15, 11, 9], k_taht: [33, 24, 2, 3],
  buzul_tahti: [28, 27, 12, 12],
};

const ROOMS: RoomDef[] = [
  room('giris', 'Donmuş Kapı', 17, 34, 6, 5, 'ice', 'ice', 0.3),
  room('k_giris', 'Kar Geçidi', 18, 29, 4, 5, 'ice', 'ice', 0.4),
  room('buz_avlusu', 'Donmuş Avlu', 16, 17, 12, 12, 'ice', 'ice', 0.5),
  room('k_bati', 'Yeti Patikası', 12, 20, 4, 4, 'dirt', 'cave', 0.5),
  room('yeti_magarasi', 'Yeti İni', 0, 14, 12, 12, 'dirt', 'cave', 0.3, { boss: 1 }),
  room('k_kuzeybati', 'Buzlu Merdiven', 2, 10, 4, 4, 'ice', 'ice', 0.3),
  room('buz_kutuphane', 'Buz Kütüphanesi', 0, 0, 10, 10, 'wood', 'ice', 0.6),
  room('k_kuzey', 'Kristal Koridor', 10, 3, 5, 4, 'ice', 'ice', 0.4),
  room('merdiven', 'Donmuş Şelale Yolu', 19, 12, 2, 5, 'ice', 'ice', 0.3, { skip: true }),
  room('cadi_kulesi', 'Cadı Kulesi', 15, 0, 12, 12, 'tiles', 'ice', 0.2, { boss: 2 }),
  room('k_dogu', 'Ayaz Köprüsü', 27, 3, 4, 4, 'ice', 'ice', 0.3),
  room('kristal_galeri', 'Kristal Galeri', 31, 0, 10, 11, 'ice', 'ice', 0.6),
  room('k_guneydogu', 'Şövalye Yolu', 34, 11, 4, 4, 'tiles', 'ice', 0.3),
  room('sovalye_salonu', 'Ayaz Şövalyeleri Salonu', 30, 15, 11, 9, 'tiles', 'ice', 0.4),
  room('k_taht', 'Taht Kapısı', 34, 24, 4, 3, 'tiles', 'ice', 0.2),
  room('buzul_tahti', 'Buzul Tahtı', 28, 27, 12, 12, 'ice', 'ice', 0.1, { boss: 3 }),
];

const DOORS: DoorDef[] = [
  door('giris', 'k_giris', 18, 34, 'n', 4, 'none'),
  door('k_giris', 'buz_avlusu', 18, 29, 'n', 4, 'none'),
  door('buz_avlusu', 'k_bati', 16, 20, 'w', 4, 'none'),
  door('k_bati', 'yeti_magarasi', 12, 20, 'w', 4, 'boss_lock'),
  door('yeti_magarasi', 'k_kuzeybati', 2, 14, 'n', 4, 'boss_exit'),
  door('k_kuzeybati', 'buz_kutuphane', 2, 10, 'n', 4, 'none'),
  door('buz_kutuphane', 'k_kuzey', 9, 3, 'e', 4, 'none'),
  door('k_kuzey', 'cadi_kulesi', 14, 3, 'e', 4, 'boss_lock'),
  door('buz_avlusu', 'merdiven', 19, 17, 'n', 2, 'none'),
  door('merdiven', 'cadi_kulesi', 19, 12, 'n', 2, 'boss_lock'),
  door('cadi_kulesi', 'k_dogu', 26, 3, 'e', 4, 'boss_exit'),
  door('k_dogu', 'kristal_galeri', 30, 3, 'e', 4, 'none'),
  door('kristal_galeri', 'k_guneydogu', 34, 10, 's', 4, 'none'),
  door('k_guneydogu', 'sovalye_salonu', 34, 14, 's', 4, 'none'),
  door('sovalye_salonu', 'k_taht', 34, 23, 's', 4, 'none'),
  door('k_taht', 'buzul_tahti', 34, 26, 's', 4, 'boss_lock'),
];

const PACKS_RAW: PackDef[] = [
  pack('d3_p01', 'k_giris', 19.5, 31, 10, [['frost_dead', 0.24, 0], ['frost_dead', -0.3, 0.35], ['frost_dead', 0.05, -0.66], ['ice_bat', 0.38, 0.62], ['ice_bat', -0.7, -0.16], ['ice_bat', 0.66, -0.53], ['ice_bat', -0.22, 1.03]]),
  pack('d3_p02', 'buz_avlusu', 14.5, 26, 12, [['frost_dead', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66], ['frost_dead', 0.48, 0.62], ['frost_wraith', -1.12, -0.56]]),
  pack('d3_p03', 'buz_avlusu', 25, 26, 14, [['yeti_brute', 0, 0], ['snow_spider', 0.95, -0.93], ['snow_spider', 1.32, -0.11]]),
  pack('d3_p04', 'buz_avlusu', 23.5, 22.5, 10, [['ice_bat', 0.3, 0], ['ice_bat', -0.38, 0.35], ['ice_bat', 0.06, -0.66], ['ice_bat', 0.48, 0.62], ['ice_bat', -0.88, -0.16], ['ice_bat', 0.83, -0.53], ['ice_bat', -0.28, 1.03], ['ice_bat', -0.53, -1.02], ['ice_bat', 1.15, 0.42], ['ice_bat', -1.2, 0.49]]),
  pack('d3_p05', 'buz_avlusu', 14.5, 19.5, 14, [['frost_slime', 0.3, 0], ['frost_slime', -0.38, 0.35], ['frost_slime', 0.06, -0.66], ['frost_slime', 0.48, 0.62], ['ice_elemental', -0.61, -1.09]]),
  pack('d3_p06', 'buz_avlusu', 25, 19.5, 14, [['frost_knight', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66], ['frost_dead', 0.48, 0.62]]),
  pack('d3_p07', 'buz_avlusu', 16, 23, 8, [['yeti_brute', 0, 0]], { patrol: [[14, 23], [26, 23]] }),
  pack('d3_p08', 'buz_avlusu', 19.5, 19, 14, [['frost_wraith', -1.35, 0], ['frost_wraith', -0.45, 0], ['snow_spider', 0.45, 0], ['snow_spider', 1.35, 0]]),
  pack('d3_p09', 'k_bati', 10, 21.5, 9, [['ice_bat', 0.3, 0], ['ice_bat', -0.38, 0.35], ['ice_bat', 0.06, -0.66], ['snow_spider', -1.25, 0.45], ['snow_spider', -1.25, -0.45]]),
  pack('d3_p10', 'k_kuzeybati', 3.5, 12.5, 6, [['frost_slime', 0.3, 0], ['frost_slime', -0.38, 0.35], ['frost_slime', 0.06, -0.66]]),
  pack('d3_p11', 'buz_kutuphane', 2.5, 2.5, 14, [['frost_dead', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66], ['frost_wraith', -0.62, -1.17], ['frost_wraith', 0.27, -1.3]]),
  pack('d3_p12', 'buz_kutuphane', 7, 2.5, 14, [['ice_bat', 0.3, 0], ['ice_bat', -0.38, 0.35], ['ice_bat', 0.06, -0.66], ['ice_bat', 0.48, 0.62], ['ice_elemental', 0.16, -1.32], ['frost_wraith', 0.96, -0.92]]),
  pack('d3_p13', 'buz_kutuphane', 5, 7, 14, [['frost_knight', 0.3, 0], ['frost_slime', -0.38, 0.35], ['frost_slime', 0.06, -0.66], ['frost_slime', 0.48, 0.62]]),
  pack('d3_p14', 'k_kuzey', 12, 4.5, 8, [['frost_dead', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66], ['frost_dead', 0.48, 0.62]]),
  pack('d3_p15', 'merdiven', 19.5, 13.5, 6, [['ice_elemental', 0, 0]], { optional: true }),
  pack('d3_p16', 'k_dogu', 26.5, 4.5, 9, [['snow_spider', 0, -0.7], ['snow_spider', 0, 0], ['snow_spider', 0, 0.7]]),
  pack('d3_p17', 'kristal_galeri', 31.5, 2.5, 16, [['frost_slime', 0.3, 0], ['frost_slime', -0.38, 0.35], ['ice_elemental', 0.79, -1.07], ['ice_elemental', 1.29, -0.32]]),
  pack('d3_p18', 'kristal_galeri', 36.5, 2.5, 14, [['yeti_brute', 0.3, 0], ['ice_bat', -0.38, 0.35], ['ice_bat', 0.06, -0.66], ['ice_bat', 0.48, 0.62], ['ice_bat', -0.88, -0.16], ['ice_bat', 0.83, -0.53], ['ice_bat', -0.28, 1.03]]),
  pack('d3_p19', 'kristal_galeri', 31.5, 8, 16, [['frost_dead', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66], ['frost_dead', 0.48, 0.62], ['frost_wraith', 1.16, 0.66], ['frost_wraith', 0.47, 1.24]]),
  pack('d3_p20', 'kristal_galeri', 36.5, 7.5, 17, [['frost_knight', 0, 0], ['ice_elemental', 1.33, 0.02], ['snow_spider', 1.01, 0.86]]),
  pack('d3_p21', 'k_guneydogu', 33.5, 12.5, 8, [['frost_dead', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_slime', 0.06, -0.66], ['frost_slime', 0.48, 0.62]]),
  pack('d3_p22', 'sovalye_salonu', 31.5, 17, 16, [['frost_knight', 0.3, 0], ['frost_knight', -0.38, 0.35]]),
  pack('d3_p23', 'sovalye_salonu', 37, 17, 16, [['frost_knight', 0, 0], ['frost_wraith', 1.28, 0.36], ['frost_wraith', 0.76, 1.09]]),
  pack('d3_p24', 'sovalye_salonu', 34, 21, 18, [['frost_dead', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66], ['frost_dead', 0.48, 0.62], ['frost_dead', -0.88, -0.16], ['frost_dead', 0.83, -0.53], ['ice_elemental', 0.1, 1.25]]),
  pack('d3_p25', 'k_taht', 33.5, 25, 12, [['frost_knight', 0.3, 0], ['frost_dead', -0.38, 0.35], ['frost_dead', 0.06, -0.66]]),
];

const START: [number, number] = [19.5, 37];
const FONT: [number, number] = [19.5, 35];
const EXIT: [number, number] = [33.5, 29];

const R = makeRescale({
  seed: 'buzul_tahti', oldRect: OLD_RECT, rooms: ROOMS, doors: DOORS, packsRaw: PACKS_RAW,
  anchors: [
    { x: START[0], z: START[1], r: 2.0 },
    { x: FONT[0], z: FONT[1], r: 1.6 },
    { x: EXIT[0], z: EXIT[1], r: 2.8 },
    { x: 3.5, z: 20.5, r: 4.5 },     // Ak Pence
    { x: 19.5, z: 4.5, r: 4.5 },     // Ayaz Ana
    { x: 33.5, z: 34, r: 5.0 },      // Tugrul
    { x: 27, z: 28, r: 1.5 },        // Kudret Sunagi
    { x: 39, z: 22, r: 1.5 },        // Koruma Sunagi
  ],
});
const { at2, near } = R;
const PACKS = R.packs;
const BOSSES = [
  R.bossAtNew('boss_ak_pence', 'yeti_magarasi', 3.5, 20.5, 90, 1),
  R.bossAtNew('boss_ayaz_ana', 'cadi_kulesi', 19.5, 4.5, 180, 2),
  R.bossAtNew('boss_tugrul', 'buzul_tahti', 33.5, 34, 180, 3),
];

const THEME: DungeonTheme = {
  fogColor: 0x14283c, fogNear: 8, fogFar: 40, ambient: 0x3a6088, ambientIntensity: 0.6, hemiSky: 0x7fb0d8, hemiGround: 0x1c2c3c,
  torchColor: 0xffd8a0, bloomStrength: 0.35, music: 'dungeon_frost', palette: [0xeaf6ff, 0x9fd8ff, 0x4a7aa0, 0x203a5a, 0xffd8a0], tint: 0xc8e0ff,
  moon: { color: 0xdff0ff, intensity: 0.45 }, rim: { color: 0x9fd8ff, intensity: 0.5 },
};


// ---------------------------------------------------------------------------------------------------------------------
// Decoration (hand placed, GDD coordinates)
// ---------------------------------------------------------------------------------------------------------------------
const ICE = 0x80c8ff;     // blue braziers / crystals
const FROST = 0xbfe8ff;   // frozen tint
const SNOW = 0xeef6ff;    // snow drifts

const D = R.D;

const shrine = (p: Props, x: number, z: number, crystal: 'crystal_blue' | 'crystal_purple', color: number, id: string): void => {
  p.at(kg('altar-stone'), x, z, { scale: 3, collide: true, tint: FROST, id, tag: 'shrine' });
  p.at(gp(crystal), x, z, { y: 2.0, scale: 0.55, emissive: color, light: lt(color, 1.7, 7, true, 0.7), id: `${id}_crystal` });
  p.ring(dg('candle_lit'), x, z, 0.95, 4, { tint: FROST }, 'out', 45);
};
/** Snow drift = a big pale rock. */
const drift = (p: Props, x: number, z: number, s = 1.2, rot = p.rnd(0, 360)): Props => p.at(gp('rock_medium'), x, z, { scale: s, rot, tint: SNOW });
/** Glowing ice crystal with a cold light. */
const crystal = (p: Props, x: number, z: number, s = 1, o: { collide?: boolean; purple?: boolean; strength?: number } = {}): Props =>
  p.at(gp(o.purple ? 'crystal_purple' : 'crystal_blue'), x, z, { scale: s, rot: p.rnd(0, 360), collide: o.collide, light: lt(o.purple ? 0xb060ff : ICE, o.strength ?? 1.6, 8, false, 0.9 * s) });
/** town-pack single rocks, used as snow covered boulders. */
const rockS = (l: string): string => tw(`decoration/nature/rock_single_${l}`);
const cold = (p: Props, n: number, area: { x0: number; z0: number; x1: number; z1: number }): void => {
  p.scatter(n, [hw('bone_A'), hw('bone_C'), hw('skull'), gp('rock_small'), gp('bone_pile')], area, { tint: 0xdcecff }, { minDist: 0.7 });
};

// ---- giris: Donmus Kapi (start) -------------------------------------------------------------------------------------
D.room('giris', (p, r) => {
  p.at(gp('font_of_power'), FONT[0], FONT[1], { collide: true, id: 'font_of_power', tag: 'socket', light: lt(0x90d0ff, 2.2, 11, false, 2.0) });
  crystal(p, 17.2, 34.2, 0.9, { collide: true }).at(gp('crystal_blue'), 21.8, 37.6, { scale: 1.0, collide: true, rot: 80, light: lt(ICE, 1.6, 8, false, 0.9) });
  drift(p, 17.1, 37.5, 1.5).at(gp('rock_medium'), 22.0, 34.0, { scale: 1.0, tint: SNOW, rot: 100 });
  drift(p, 21.6, 33.9, 0.9);
  p.wall(r, 'n', [17.6, 21.4], dg('banner_patternB_blue'), { tint: FROST });
  p.wall(r, 'w', [36.0], dg('banner_thin_blue'), { tint: FROST }).wall(r, 'e', [36.0], dg('banner_thin_blue'), { tint: FROST });
  p.torches(r, 'w', [34.6, 37.4], ICE).torches(r, 'e', [34.6, 37.4], ICE).torches(r, 's', [18.0, 21.0], ICE);
  p.at(dg('barrel_small'), 17.0, 36.4, { tint: FROST, collide: true, tag: 'breakable' }).at(dg('crates_stacked'), 22.0, 36.0, { tint: FROST, rot: -30, collide: true, tag: 'breakable' });
  p.at(gp('chest_wood'), 17.2, 37.9, { tint: FROST, rot: 20, collide: true });
  cold(p, 6, Props.inner(r, 0.7));
});

// ---- k_giris: Kar Gecidi -------------------------------------------------------------------------------------------
D.room('k_giris', (p, r) => {
  // frozen corpses of earlier delvers along the walls (decor only)
  for (const [x, z, rot] of [[18.95, 29.6, 90], [20.05, 31.2, -90], [18.95, 32.4, 80]] as [number, number, number][]) {
    p.at(skl('Skeleton_Minion'), x, z, { pose: 'Skeletons_Inactive_Floor_Pose', tint: 0xbfe8ff, rot });
  }
  drift(p, 19.1, 30.4, 0.8).at(gp('rock_medium'), 20.0, 29.4, { scale: 0.7, tint: SNOW }).at(gp('rock_small'), 19.4, 32.6, { tint: SNOW, rot: 20 });
  p.at(gp('crystal_blue'), 20.0, 32.2, { scale: 0.45, light: lt(ICE, 1.2, 6, false, 0.5) });
  p.torches(r, 'w', [29.4, 31.6], ICE).torches(r, 'e', [30.4, 32.4], ICE);
  p.at(gp('chains_hanging'), 19.5, 30.2, { y: 4, tint: FROST }).at(gp('chains_hanging'), 19.6, 32.0, { y: 4, tint: FROST });
});

// ---- buz_avlusu: Frozen courtyard -----------------------------------------------------------------------------------
D.room('buz_avlusu', (p, r) => {
  p.at(kf('fountain-round'), 19.5, 22.5, { scale: 4, tint: FROST, collide: true, id: 'frozen_fountain', emissive: 0x204060, emissiveIntensity: 0.6 });
  for (const [x, z] of [[13.0, 17.8], [26.0, 17.8], [13.0, 27.4], [26.0, 27.4]] as [number, number][]) {
    p.at(kg('pillar-obelisk'), x, z, { scale: 3.5, tint: FROST, collide: true });                       // statues
    p.at(gp('crystal_blue'), x, z, { y: 3.5, scale: 0.4, light: lt(ICE, 1.2, 7, false, 0.3) });
  }
  [[rockS('A'), 12.6, 16.6, 0.5], [rockS('C'), 22.8, 17.1, 20], [rockS('E'), 12.3, 23.8, 70], [rockS('B'), 26.8, 24.6, 130], [rockS('D'), 17.0, 27.6, 200], [rockS('A'), 23.8, 27.7, 40], [rockS('C'), 11.9, 20.6, 90], [rockS('E'), 27.0, 20.2, 150]].forEach(([m, x, z, rot]) => {
    p.at(m as string, x as number, z as number, { scale: 6, tint: SNOW, rot: rot as number, collide: true });
  });
  for (const [x, z, rot] of [[12.4, 18.6, 0], [24.0, 16.8, 100], [26.9, 18.8, 200], [12.3, 26.4, 70]] as [number, number, number][]) {
    p.at(hw('tree_pine_yellow_large'), x, z, { tint: 0xdfefff, rot, scale: 0.9, collide: true });
  }
  for (const [x, z] of [[14.0, 28.0], [25.0, 28.0], [12.0, 22.0], [27.0, 22.0], [19.5, 19.5], [17.6, 19.5]] as [number, number][]) {
    p.at(dg('column'), x, z, { collide: true, tint: FROST });
    p.at(kg('fire-basket'), x, z, { y: 1.4, scale: 3, emissive: ICE, light: lt(ICE, 2.0, 11, true, 0.7) });                 // blue braziers
  }
  shrine(p, 27, 28, 'crystal_purple', 0xb060ff, 'shrine_power_1');                                      // Kudret Sunagi
  p.at(gp('rock_large'), 11.9, 17.4, { tint: SNOW, collide: true, rot: 20 }).at(gp('rock_large'), 27.2, 27.6, { tint: SNOW, collide: true, rot: 200, scale: 0.7 });
  drift(p, 18.0, 25.8, 1.4).at(gp('rock_medium'), 21.2, 26.2, { tint: SNOW, scale: 1.0 });
  cold(p, 12, Props.inner(r, 1.0));
  p.at(dg('barrel_small_stack'), 12.1, 24.4, { tint: FROST, rot: 90, collide: true, tag: 'breakable' }).at(dg('crates_stacked'), 26.9, 22.4, { tint: FROST, rot: 160, collide: true, tag: 'breakable' });
});

// ---- k_bati: Yeti Patikasi -----------------------------------------------------------------------------------------
D.room('k_bati', (p, r) => {
  p.scatter(8, [hw('bone_A'), hw('bone_B'), hw('bone_C'), hw('skull')], Props.inner(r, 0.7), { tint: 0xe0ecf8 }, { minDist: 0.6 });
  drift(p, 8.2, 21.0, 0.8).at(gp('rock_small'), 10.8, 22.0, { tint: SNOW }).at(gp('rock_medium'), 8.0, 22.0, { tint: SNOW, scale: 0.8 });
  p.at(gp('bone_pile'), 9.6, 20.9, { rot: 30, tint: 0xdcecff });
  p.torches(r, 'n', [9.0], ICE).torches(r, 's', [10.4], ICE);
});

// ---- yeti_magarasi: Boss 1 arena (Ak Pence), open cave with no pillars -----------------------------------------------
D.room('yeti_magarasi', (p, r) => {
  // frozen waterfall on the west wall (emissive pale blue cliff)
  p.at(gp('rock_cliff'), 0.1, 19.0, { rot: 90, scale: 1.3, tint: 0x9fd8ff, emissive: 0x9fd8ff, emissiveIntensity: 0.5, id: 'frozen_waterfall', light: lt(0x9fd8ff, 1.8, 14, false, 2.5) });
  p.at(gp('rock_cliff'), 0.2, 22.6, { rot: 90, scale: 1.0, tint: 0xbfe8ff });
  p.at(gp('bone_pile'), 5.4, 16.0, { rot: 40, tint: 0xe0ecf8 }).at(gp('bone_pile'), 6.4, 23.8, { rot: 200 }).at(gp('bone_pile'), 2.4, 24.0, { rot: 120 }).at(gp('bone_pile'), 5.8, 20.8, { rot: 10 });
  p.at(hw('ribcage'), 4.0, 16.6, { rot: 50 }).at(hw('ribcage'), 1.5, 15.7, { rot: 160 }).at(hw('skull'), 6.8, 22.0).at(hw('skull'), 2.0, 17.0, { rot: 90 }).at(hw('bone_C'), 5.0, 24.2);
  drift(p, 1.0, 15.6, 1.6).at(gp('rock_medium'), 6.9, 15.6, { tint: SNOW, rot: 60, scale: 1.3 }).at(gp('rock_large'), 6.7, 24.2, { tint: SNOW, rot: 210, scale: 0.9 });
  drift(p, 0.9, 24.5, 1.3);
  crystal(p, 7.0, 18.2, 0.7).at(gp('crystal_blue'), 0.7, 21.2, { scale: 0.6, light: lt(ICE, 1.4, 8, false, 0.7) });
  p.wall(r, 's', [4.0], hw('bone_B'), { y: 0.1 }, 0.3);
  p.torches(r, 'n', [1.8, 5.8], ICE).torches(r, 's', [1.8, 5.6], ICE).torches(r, 'e', [16.4, 23.6], ICE);
  p.at(gp('chains_hanging'), 3.0, 18.0, { y: 4, tint: FROST });
});

// ---- k_kuzeybati: Buzlu Merdiven ----------------------------------------------------------------------------------------
D.room('k_kuzeybati', (p, r) => {
  p.at(dg('stairs_walled'), 3.5, 9.9, { rot: 180, scale: 0.9, tint: FROST });
  p.torches(r, 'w', [11.0, 13.0], ICE).torches(r, 'e', [11.8, 13.6], ICE);
  p.at(dg('torch_lit'), 2.9, 13.9, { y: 0, light: lt(ICE, 1.6, 8, true, 1.0), tint: 0x80c8ff });
  drift(p, 3.0, 13.8, 0.7).at(gp('rock_small'), 4.0, 12.0, { tint: SNOW });
});

// ---- buz_kutuphane: Frozen library -------------------------------------------------------------------------------------
D.room('buz_kutuphane', (p, r) => {
  // shelves along the walls (ten)
  p.wall(r, 'n', [1.0, 3.2, 5.6, 7.8], fu('shelf_B_large_decorated'), { y: 0.4, scale: 1.1, tint: FROST }, 0.1);
  p.wall(r, 'w', [2.6, 5.4], fu('shelf_A_big'), { y: 0.5, scale: 1.1, tint: FROST }, 0.1).wall(r, 'e', [1.6, 4.8, 7.4], fu('shelf_B_large'), { y: 0.5, scale: 1.1, tint: FROST }, 0.1);
  p.at(fu('book_set'), 1.0, 6.4, { tint: FROST, y: 0.3, rot: 40 }).at(fu('book_set'), 8.2, 5.9, { tint: FROST, y: 0.3, rot: 190 }).at(fu('book_single'), 3.4, 8.2, { y: 0.3, rot: 100, tint: FROST });
  p.at(fu('table_medium_long'), 4.2, 5.0, { rot: 90, collide: true, tint: FROST }).at(dg('candle'), 4.2, 4.4, { y: 1.0, tint: FROST });
  p.at(fu('chair_A_wood'), 3.0, 5.1, { rot: 90, tint: FROST }).at(fu('chair_A_wood'), 5.4, 4.7, { rot: -80, tint: FROST });
  p.at(fu('rug_rectangle_stripes_A'), 4.2, 5.0, { rot: 90, y: 0.04, tint: 0xd8ecff, scale: 1.3 });
  crystal(p, 7.8, 8.2, 1.0, { collide: true }).at(gp('crystal_blue'), 0.7, 8.4, { scale: 0.9, collide: true, rot: 40, light: lt(ICE, 1.6, 8, false, 0.9) });
  crystal(p, 8.8, 0.8, 0.8, { collide: true });
  p.at(fu('lamp_standing'), 8.6, 7.4, { tint: FROST, light: lt(ICE, 1.2, 7, false, 2.0) });
  p.at(fu('cabinet_small_decorated'), 0.8, 0.8, { tint: FROST, rot: 45, collide: true });
  p.torches(r, 's', [1.4, 4.0, 7.6], ICE).torches(r, 'w', [0.6], ICE);
  p.at(gp('chains_hanging'), 4.0, 3.0, { y: 4, tint: FROST }).at(gp('chains_hanging'), 6.5, 6.5, { y: 4, tint: FROST });
  cold(p, 6, Props.inner(r, 0.9));
});

// ---- k_kuzey: Kristal Koridor ------------------------------------------------------------------------------------------
D.room('k_kuzey', (p, r) => {
  for (const [x, z] of [[10.6, 3.9], [12.4, 3.9], [14.0, 3.9]] as [number, number][]) p.at(gp('crystal_blue'), x, z, { scale: 0.5, collide: false, rot: p.rnd(0, 360), light: lt(ICE, 1.3, 6, false, 0.5) });
  for (const [x, z] of [[10.9, 5.1], [13.1, 5.1]] as [number, number][]) p.at(gp('crystal_blue'), x, z, { scale: 0.5, rot: p.rnd(0, 360), light: lt(ICE, 1.3, 6, false, 0.5) });
  p.torches(r, 'n', [11.5], ICE).torches(r, 's', [12.5], ICE);
  drift(p, 14.0, 5.0, 0.6);
});

// ---- merdiven: Donmus Selale Yolu (skip route) ----------------------------------------------------------------------------
D.room('merdiven', (p, r) => {
  p.at(gp('rock_cliff'), 18.9, 13.0, { rot: 90, scale: 0.9, tint: 0x9fd8ff, emissive: 0x9fd8ff, emissiveIntensity: 0.5, light: lt(0x9fd8ff, 1.6, 12, false, 2.0) });
  drift(p, 20.1, 15.8, 0.7).at(gp('rock_small'), 19.3, 10.4, { tint: SNOW }).at(gp('rock_medium'), 20.0, 10.2, { tint: SNOW, scale: 0.6 });
  p.torches(r, 'e', [11.4, 14.8], ICE);
  p.at(hw('bone_A'), 19.6, 14.9, { tint: 0xe0ecf8 });
});

// ---- cadi_kulesi: Boss 2 arena (Ayaz Ana) ---------------------------------------------------------------------------------
D.room('cadi_kulesi', (p, r) => {
  // blue-fire cauldron at the centre (does not collide)
  p.at(ks('campfire-stand'), 19.5, 4.5, { scale: 3, light: lt(ICE, 2.6, 14, true, 1.2), emissive: ICE }).at(ks('bucket'), 19.5, 4.6, { scale: 3, y: 0.9, tint: ICE, emissive: ICE });
  // four crystal pylons = mirror image spawn points
  [[17, 2], [23, 2], [17, 8], [23, 8]].forEach(([x, z], i) => {
    p.at(gp('crystal_blue'), x, z, { scale: 1.4, collide: true, tag: 'socket', id: `pylon_${i + 1}`, light: lt(ICE, 2.0, 10, false, 1.3) });
  });
  p.torches(r, 'n', [15.4, 18.0, 21.0, 23.6], ICE).torches(r, 's', [15.4, 18.0, 21.0, 23.6], ICE).torches(r, 'w', [1.6, 7.8], ICE).torches(r, 'e', [1.6, 7.8], ICE);
  drift(p, 15.2, 0.8, 0.8).at(gp('rock_medium'), 23.9, 8.9, { tint: SNOW, scale: 0.9 });
  p.wall(r, 'n', [19.5], dg('banner_triple_blue'));
  p.wall(r, 'w', [4.6], dg('banner_patternA_blue')).wall(r, 'e', [4.6], dg('banner_patternA_blue'));
  p.at(gp('statue_hooded'), 15.0, 9.0, { rot: 45, collide: true, tint: FROST }).at(gp('statue_hooded'), 24.0, 0.8, { rot: 225, collide: true, tint: FROST });
  p.at(fu('book_set'), 16.0, 3.4, { y: 0.02, rot: 30, tint: FROST }).at(hw('skull'), 22.4, 6.2, { tint: FROST });
});

// ---- k_dogu: Ayaz Koprusu ---------------------------------------------------------------------------------------------------
D.room('k_dogu', (p, r) => {
  p.row(dg('barrier'), 25.2, 3.75, 28.0, 3.75, 2, { tint: FROST }).row(dg('barrier'), 25.2, 5.25, 28.0, 5.25, 2, { tint: FROST });
  p.torches(r, 'n', [26.0], ICE).torches(r, 's', [27.0], ICE);
  drift(p, 27.8, 5.0, 0.6);
});

// ---- kristal_galeri: Gallery of giant crystals -------------------------------------------------------------------------------
D.room('kristal_galeri', (p, r) => {
  for (const [x, z, s] of [[30.2, 5.0, 2.0], [34.0, 0.8, 2.0], [37.8, 4.4, 2.0], [34.6, 9.6, 2.0], [29.6, 9.8, 2.0]] as [number, number, number][]) {
    p.at(gp('crystal_blue'), x, z, { scale: s, collide: true, rot: p.rnd(0, 360), light: lt(ICE, 2.2, 12, false, 1.8) });
  }
  p.at(gp('crystal_purple'), 36.2, 9.6, { scale: 1.5, collide: true, rot: 70, light: lt(0xb060ff, 2.0, 11, false, 1.6) }).at(gp('crystal_purple'), 29.4, 1.0, { scale: 1.5, collide: true, rot: 200, light: lt(0xb060ff, 2.0, 11, false, 1.6) });
  for (const [x, z] of [[32.0, 5.0], [36.0, 5.4], [33.4, 2.8], [34.8, 7.6], [30.8, 7.0], [36.8, 2.0], [31.0, 3.0], [37.0, 6.8]] as [number, number][]) {
    p.at(gp('crystal_blue'), x, z, { scale: 0.4, rot: p.rnd(0, 360), light: lt(ICE, 1.1, 6, false, 0.4) });
  }
  p.at(gp('chest_gold'), 38.0, 10.0, { rot: -90, collide: true, id: 'chest_galeri', tag: 'chest', tint: FROST });
  p.torches(r, 'n', [30.0, 33.0, 36.0], ICE).torches(r, 'w', [2.0, 8.0], ICE).torches(r, 'e', [2.0, 7.0], ICE);
  drift(p, 28.9, 4.6, 0.8).at(gp('rock_medium'), 38.1, 0.4, { tint: SNOW, scale: 0.8 });
  cold(p, 6, Props.inner(r, 1.0));
});

// ---- k_guneydogu: Sovalye Yolu ----------------------------------------------------------------------------------------------
D.room('k_guneydogu', (p, r) => {
  // two frozen knight statues (Blocking pose)
  p.at(chr('Knight'), 32.95, 11.5, { pose: 'Blocking', tint: 0xcfe8ff, rot: 90, collide: true, show: ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'], id: 'frozen_knight_1' });
  p.at(chr('Knight'), 34.05, 13.7, { pose: 'Blocking', tint: 0xcfe8ff, rot: -90, collide: true, show: ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'], id: 'frozen_knight_2' });
  p.torches(r, 'w', [12.4], ICE).torches(r, 'e', [11.6, 13.4], ICE);
  drift(p, 33.0, 13.9, 0.6);
  p.wall(r, 'w', [13.6], dg('banner_shield_blue'), { tint: FROST });
});

// ---- sovalye_salonu: Hall of the frozen guard --------------------------------------------------------------------------------
D.room('sovalye_salonu', (p, r) => {
  p.at(dg('table_long_tablecloth_decorated_A'), 31.2, 20.4, { rot: 90, collide: true, tint: FROST }).at(dg('table_long_tablecloth_decorated_A'), 37.2, 20.6, { rot: 90, collide: true, tint: FROST });
  for (const z of [19.0, 20.0, 21.0, 22.0]) {
    p.at(dg('chair'), 29.9, z, { rot: 90, tint: FROST }).at(dg('chair'), 32.5, z, { rot: -90, tint: FROST }).at(dg('chair'), 35.9, z, { rot: 90, tint: FROST }).at(dg('chair'), 38.5, z, { rot: -90, tint: FROST });
  }
  p.wall(r, 'n', [30.6, 36.6], dg('banner_triple_blue')).wall(r, 's', [30.6, 37.4], dg('banner_triple_blue'));
  p.wall(r, 'w', [16.8, 21.6], dg('sword_shield_gold'), { y: 2.4, tint: FROST }).wall(r, 'e', [16.8, 21.2], dg('sword_shield_gold'), { y: 2.4, tint: FROST });
  shrine(p, 39, 22, 'crystal_blue', 0x60a0ff, 'shrine_ward_1');                                        // Koruma Sunagi
  p.torches(r, 'n', [29.4, 33.0, 35.6, 38.4], ICE).torches(r, 's', [29.4, 35.0, 38.4], ICE).torches(r, 'w', [18.4], ICE).torches(r, 'e', [18.6], ICE);
  p.at(dg('crates_stacked'), 29.2, 15.4, { rot: 30, tint: FROST, collide: true, tag: 'breakable' }).at(dg('barrel_large'), 39.0, 15.4, { tint: FROST, collide: true, tag: 'breakable' });
  crystal(p, 29.1, 22.8, 0.8, { collide: true });
  drift(p, 38.6, 23.2, 0.9);
  p.at(dg('plate_food_A'), 31.2, 19.4, { y: 1.0, tint: FROST }).at(dg('plate_food_B'), 37.2, 21.6, { y: 1.0, tint: FROST });
});

// ---- k_taht: Taht Kapisi -----------------------------------------------------------------------------------------------------
D.room('k_taht', (p, r) => {
  p.wall(r, 'w', [24.6], dg('banner_patternC_blue'), { tint: FROST }).wall(r, 'e', [24.6], dg('banner_patternC_blue'), { tint: FROST });
  p.torches(r, 'w', [25.6], ICE).torches(r, 'e', [25.6], ICE);
  p.at(gp('crystal_blue'), 32.9, 23.9, { scale: 0.7, light: lt(ICE, 1.4, 7, false, 0.6) }).at(gp('crystal_blue'), 34.1, 23.9, { scale: 0.7, rot: 90, light: lt(ICE, 1.4, 7, false, 0.6) });
  drift(p, 33.0, 26.0, 0.5);
});

// ---- buzul_tahti: Boss 3 arena (Donmus Kral Tugrul) ----------------------------------------------------------------------
D.room('buzul_tahti', (p, r) => {
  for (const x of [33.0, 33.5, 34.0]) p.at(dg('floor_foundation_front'), x, 37.7, { rot: 180, collide: true, tint: FROST });
  p.at(dg('chair'), 33.5, 37.7, { y: 2.0, scale: 2.5, tint: 0x9fd8ff, rot: 180, id: 'ice_throne', emissive: 0x4a90c0, emissiveIntensity: 0.4 });
  p.at(dg('coin_stack_large'), 32.2, 37.5, { y: 0, tint: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 0.5 }).at(dg('coin_stack_medium'), 34.9, 37.5, { tint: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 0.5 });
  // four ice pillars (block line of sight for Buz Nefesi, shatter in phase 3)
  [[30.5, 30.5], [36.5, 30.5], [30.5, 35], [36.5, 35]].forEach(([x, z], i) => {
    p.at(dg('pillar'), x, z, { tint: FROST, collide: true, tag: 'pillar', id: `ice_pillar_${i + 1}` });
    p.at(gp('crystal_blue'), x, z, { y: 4.0, scale: 0.8, light: lt(ICE, 2.0, 10, false, 0.5) });
  });
  p.torches(r, 'n', [29.4, 37.6], ICE).torches(r, 'w', [29.0, 32.0, 35.5], ICE).torches(r, 'e', [29.0, 32.0, 35.5], ICE).torches(r, 's', [29.4, 37.6], ICE);
  p.wall(r, 's', [30.4, 36.6], dg('banner_triple_blue')).wall(r, 'w', [37.4], dg('banner_patternB_blue'), { tint: FROST }).wall(r, 'e', [37.4], dg('banner_patternB_blue'), { tint: FROST });
  p.at(gp('statue_hooded'), 28.6, 37.6, { rot: 90, collide: true, tint: FROST }).at(gp('statue_hooded'), 38.4, 37.6, { rot: -90, collide: true, tint: FROST });
  drift(p, 28.2, 27.4, 1.0).at(gp('rock_medium'), 38.8, 27.4, { tint: SNOW, scale: 1.0, rot: 140 });
  crystal(p, 28.4, 33.0, 1.0, { collide: true }).at(gp('crystal_blue'), 38.6, 33.0, { scale: 1.0, collide: true, rot: 200, light: lt(ICE, 1.8, 9, false, 1.0) });
  cold(p, 8, Props.inner(r, 1.2));
});

// ---------------------------------------------------------------------------------------------------------------------
// Zones, per-room extras, pack flags, assembly
// ---------------------------------------------------------------------------------------------------------------------
const rune = (x: number, z: number, r: number, glow = ICE, intensity = 1.0): ZoneDef => circleZone('rune', x, z, r, { color: 0x1a3048, glow, glowIntensity: intensity });

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { ambientVfx: 'ambient_snow' },
  k_giris: { ambientVfx: 'ambient_snow' },
  buz_avlusu: { ambientVfx: 'ambient_snow', lightColor: ICE, fog: { color: 0xc8e0f0, near: 18, far: 80 } },
  k_bati: { ambientVfx: 'ambient_snow' },
  yeti_magarasi: { explicitDecor: true, ambientVfx: 'ambient_snow', lightColor: 0x9fd8ff },
  k_kuzeybati: { ambientVfx: 'ambient_snow' },
  buz_kutuphane: { ambientVfx: 'ambient_snow' },
  k_kuzey: { ambientVfx: 'ambient_snow' },
  merdiven: {
    ambientVfx: 'ambient_snow', lightColor: 0x9fd8ff,
    hazards: [{ kind: 'icicle_drop', interval: 3, warn: 1.0, radius: 1.5, coef: 1.5, stun: 0.5 }],
  },
  cadi_kulesi: { explicitDecor: true, lightColor: ICE, ambientVfx: 'ambient_snow', zones: [rune(...at2(19.5, 4.5), 3.5, ICE, 1.1)] },
  k_dogu: { ambientVfx: 'ambient_snow' },
  kristal_galeri: { ambientVfx: 'ambient_snow', lightColor: ICE, zones: [{ kind: 'ice', shape: 'rect', rect: { x: 31, z: 0, w: 10, h: 11 }, color: 0x9fd8ff, glow: 0x204060, glowIntensity: 0.4 }] },
  k_guneydogu: { ambientVfx: 'ambient_snow' },
  sovalye_salonu: { ambientVfx: 'ambient_snow' },
  k_taht: { ambientVfx: 'ambient_snow' },
  buzul_tahti: { explicitDecor: true, lightColor: 0x9fd8ff, ambientVfx: 'ambient_snow' },
};

const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  d3_p02: { big: true }, d3_p04: { big: true, note: 'Circles the frozen fountain in a 4 m loop; aggro range 11 m.' }, d3_p05: { big: true },
  d3_p07: { big: true, note: 'Lone Yeti patrol walks W-E right through the courtyard (14 s per leg).' },
  d3_p08: { note: 'Guards the frozen-waterfall skip.' },
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(...at2(19.5, 35)),
  shrines: [{ type: 'shrine_power', pos: pt(...at2(27, 28)) }, { type: 'shrine_ward', pos: pt(...at2(39, 22)) }],
  riftSpots: ([[19.5, 26], [5, 5], [12, 4.5], [34, 5], [34, 18], [22, 19]] as [number, number][]).map(([x, z]) => pt(...at2(x, z))),
  chests: [{ pos: pt(...at2(38, 10)), kind: 'chest_gold' }],
};

export const BUZUL_TAHTI: DungeonDef = {
  id: 'buzul_tahti',
  name: 'Buzul Tahtı',
  shortName: 'Buzul',
  lore: 'Kuzeyin ötesinde, bir zamanlar adil bir kral olan Tuğrul, ölümsüzlük uğruna kalbini buza sattı. Sarayı donmuş bir mezara, şövalyeleri buz heykellere döndü. Buz Cadısı Ayaz Ana kulesinden fırtınaları yönetirken, Kırağı adlı ejder tahtın üzerinde süzülür. Ak Pençe ise mağarasında yeni kemikler bekler.',
  levelRange: [30, 40],
  timerSec: 870,
  forcesRequired: 250,
  theme: THEME,
  grid: { w: 42, h: 40 },
  rooms: withProps(ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })), D.out),
  doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)),
  bosses: BOSSES,
  start: { pos: shPt(...at2(START[0], START[1])), facing: 180 },
  exit: { pos: shPt(...at2(EXIT[0], EXIT[1])) },
  extras: EXTRAS,
};
