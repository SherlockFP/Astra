import type { DoorDef, DungeonDef, DungeonTheme, PackDef, RoomDef, TileRect, ZoneDef } from '../../types/dungeons';
import {
  GRID_SHIFT, MOUNT_Y, Props, bossAt, circleZone, decorator, door, dg, gp, hw, kc, kf, kg, ks, lt, makeCtx, mon, pack, rectZone, rectsOf, pt, room, shPt, tw, withProps,
} from './kit';
import { makeRescale, oldTileRect, type Rect4 } from './rescale2';

/**
 * KIZIL DOKUMHANE (fire forge and lava) - GDD_CONTENT 4.2. Level 18-28, M+ 13:30, 270 forces (331 available).
 * Layout (rooms / doors / packs / bosses) is generated from docs/GDD_CONTENT.layout.json; decoration is hand placed.
 * Positions are written in GDD coordinates (see the COORDINATES note in kit.ts).
 */

// ---- GENERATED from docs/GDD_CONTENT.layout.json (rooms, doors, packs, bosses) ----
// SCALE PASS (docs/SCALE_REFERENCE.md section 3): combat corridors 2 -> 4 tiles, pull rooms >= 9 short side, boss arenas 12x12.
// OLD_RECT is the layout the hand placed decoration, packs, bosses and extras were written in; they are remapped below.
const OLD_RECT: Record<string, Rect4> = {
  giris: [1, 17, 5, 6], k_giris: [6, 19, 4, 2], cevher_deposu: [10, 14, 10, 12], k_kuzey: [14, 9, 2, 5], ors_salonu: [9, 0, 12, 9],
  curuf_ocagi: [1, 4, 8, 9], k_dogu1: [21, 3, 4, 2], kalip_atolyesi: [25, 0, 10, 9], k_inis: [29, 9, 2, 5], lav_kanali: [24, 14, 12, 10],
  k_guney: [29, 24, 2, 4], kopru: [34, 24, 2, 4], magma_kalbi: [25, 28, 14, 14], k_bati: [20, 32, 5, 2], kole_kampi: [9, 28, 11, 9],
  k_son: [8, 31, 1, 2], mavi_alev_sunagi: [0, 27, 8, 12],
};

const ROOMS: RoomDef[] = [
  room('giris', 'Kül Kapısı', 1, 17, 5, 6, 'lava_rock', 'forge', 0.3),
  room('k_giris', 'Cüruf Yolu', 6, 18, 4, 4, 'lava_rock', 'forge', 0.5),
  room('cevher_deposu', 'Cevher Deposu', 10, 17, 10, 11, 'lava_rock', 'forge', 0.6),
  room('k_kuzey', 'Örs Yolu', 13, 12, 4, 5, 'stone_dark', 'forge', 0.4),
  room('ors_salonu', 'Örs Salonu', 9, 0, 12, 12, 'stone_dark', 'forge', 0.2, { boss: 1 }),
  room('curuf_ocagi', 'Cüruf Ocağı', 0, 4, 9, 9, 'lava_rock', 'cave', 0.6, { optional: true }),
  room('k_dogu1', 'Kızgın Dehliz', 21, 2, 4, 4, 'lava_rock', 'forge', 0.4),
  room('kalip_atolyesi', 'Kalıp Atölyesi', 25, 0, 10, 9, 'stone_dark', 'forge', 0.6),
  room('k_inis', 'Kızgın Merdivenler', 28, 9, 4, 5, 'stone_dark', 'forge', 0.3),
  room('lav_kanali', 'Lav Kanalı', 24, 14, 12, 10, 'lava_rock', 'cave', 0.4),
  room('k_guney', 'Zincir Geçidi', 28, 24, 4, 4, 'stone_dark', 'forge', 0.3),
  room('kopru', 'Lav Köprüsü', 34, 24, 2, 4, 'wood', 'cave', 0.1, { skip: true }),
  room('magma_kalbi', 'Magma Kalbi', 25, 28, 14, 14, 'lava_rock', 'cave', 0.1, { boss: 2 }),
  room('k_bati', 'Köle Yolu', 20, 31, 5, 4, 'dirt', 'cave', 0.4),
  room('kole_kampi', 'Köle Kampı', 9, 28, 11, 9, 'dirt', 'cave', 0.7),
  room('k_son', 'Mavi Alev Kapısı', 9, 37, 2, 6, 'temple', 'forge', 0.1),
  room('mavi_alev_sunagi', 'Mavi Alev Sunağı', 0, 43, 18, 16, 'temple', 'forge', 0.1, { boss: 3 }),
];

const R = makeRescale(OLD_RECT, ROOMS);

const DOORS: DoorDef[] = [
  door('giris', 'k_giris', 5, 18, 'e', 4, 'none'),
  door('k_giris', 'cevher_deposu', 9, 18, 'e', 4, 'none'),
  door('cevher_deposu', 'k_kuzey', 13, 17, 'n', 4, 'none'),
  door('k_kuzey', 'ors_salonu', 13, 12, 'n', 4, 'boss_lock'),
  door('ors_salonu', 'curuf_ocagi', 9, 5, 'w', 2, 'boss_exit'),
  door('ors_salonu', 'k_dogu1', 20, 2, 'e', 4, 'boss_exit'),
  door('k_dogu1', 'kalip_atolyesi', 24, 2, 'e', 4, 'none'),
  door('kalip_atolyesi', 'k_inis', 28, 8, 's', 4, 'none'),
  door('k_inis', 'lav_kanali', 28, 13, 's', 4, 'none'),
  door('lav_kanali', 'k_guney', 28, 23, 's', 4, 'none'),
  { ...door('lav_kanali', 'kopru', 34, 23, 's', 2, 'kill_lock'), opensOn: { pack: 'd2_p18' } },
  door('k_guney', 'magma_kalbi', 28, 27, 's', 4, 'boss_lock'),
  door('kopru', 'magma_kalbi', 34, 27, 's', 2, 'boss_lock'),
  door('magma_kalbi', 'k_bati', 25, 31, 'w', 4, 'boss_exit'),
  door('k_bati', 'kole_kampi', 20, 31, 'w', 4, 'none'),
  door('kole_kampi', 'k_son', 9, 36, 's', 2, 'none'),
  door('k_son', 'mavi_alev_sunagi', 9, 42, 's', 2, 'boss_lock'),
  // one-way shortcut: the Ateşyürek kill opens the ore store door from the slave camp (the back way to the start side)
  { ...door('cevher_deposu', 'kole_kampi', 12, 27, 's', 2, 'kill_lock'), opensOn: { boss: 'boss_atesyurek' } },
];

const PACKS_RAW: PackDef[] = [
  pack('d2_p01', 'k_giris', 8, 19.5, undefined, [['forge_goblin', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', -0.88, -0.16], ['forge_goblin', 0.83, -0.53]]),
  pack('d2_p02', 'cevher_deposu', 12.5, 17, undefined, [['forge_goblin', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', -0.88, -0.16], ['forge_goblin', 0.83, -0.53], ['forge_goblin', -0.28, 1.03], ['forge_goblin', -0.53, -1.02], ['forge_orc', 1.15, 0.42]]),
  pack('d2_p03', 'cevher_deposu', 17.5, 17, undefined, [['lava_slime', 0.3, 0], ['lava_slime', -0.38, 0.35], ['lava_slime', 0.06, -0.66], ['forge_imp', 1.06, -0.8], ['forge_imp', 1.33, 0.06]]),
  pack('d2_p04', 'cevher_deposu', 12.5, 22.5, undefined, [['forge_demon', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', -0.88, -0.16], ['fire_priest', 0.88, 0.88]]),
  pack('d2_p05', 'cevher_deposu', 17.5, 22.5, undefined, [['magma_golem', 0, 0]]),
  pack('d2_p06', 'cevher_deposu', 15, 20, undefined, [['forge_orc', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62]], { patrol: [[11.5, 20], [18, 20]] }),
  pack('d2_p07', 'k_kuzey', 14.5, 11, undefined, [['flame_skull', 0.24, 0], ['flame_skull', -0.3, 0.35], ['flame_skull', 0.05, -0.66], ['flame_skull', 0.38, 0.62], ['flame_skull', -0.7, -0.16], ['forge_imp', 0, -1.25]]),
  pack('d2_p09', 'curuf_ocagi', 6.5, 10, undefined, [['magma_golem', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66]], { optional: true }),
  pack('d2_p10', 'curuf_ocagi', 2.5, 10.5, undefined, [['forge_demon', 0.3, 0], ['forge_demon', -0.38, 0.35]], { optional: true }),
  pack('d2_p11', 'k_dogu1', 22.5, 3.5, 6, [['forge_imp', 0, -0.7], ['forge_imp', 0, 0], ['forge_imp', 0, 0.7]]),
  pack('d2_p12', 'kalip_atolyesi', 27, 2.5, undefined, [['forge_goblin', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', 0.83, -0.53], ['forge_orc', -0.28, 1.03]]),
  pack('d2_p13', 'kalip_atolyesi', 32.5, 2.5, undefined, [['forge_demon', 0.3, 0], ['flame_skull', -0.38, 0.35], ['flame_skull', 0.06, -0.66], ['flame_skull', 0.48, 0.62], ['flame_skull', -0.88, -0.16], ['fire_priest', 1.24, -0.16]]),
  pack('d2_p14', 'kalip_atolyesi', 27, 6.5, undefined, [['lava_slime', 0.3, 0], ['lava_slime', -0.38, 0.35], ['lava_slime', 0.06, -0.66], ['lava_slime', 0.48, 0.62], ['forge_imp', 0.8, 0.96]]),
  pack('d2_p15', 'kalip_atolyesi', 32.5, 6.5, undefined, [['magma_golem', 0, 0], ['fire_priest', 1.17, 0.44]]),
  pack('d2_p16', 'k_inis', 29.5, 11, undefined, [['forge_demon', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62]]),
  pack('d2_p17', 'lav_kanali', 26, 15.8, undefined, [['forge_orc', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', -0.88, -0.16], ['forge_goblin', 0.83, -0.53]]),
  pack('d2_p18', 'lav_kanali', 30, 20.5, undefined, [['forge_imp', 1.34, -0.13], ['forge_imp', 0.45, -0.04], ['forge_imp', -0.45, 0.04], ['forge_imp', -1.34, 0.13]], { patrol: [[27, 20.5], [33, 20.5]] }),
  pack('d2_p19', 'lav_kanali', 33.5, 15.8, undefined, [['magma_golem', 0.3, 0], ['lava_slime', -0.38, 0.35], ['lava_slime', 0.06, -0.66]]),
  pack('d2_p20', 'lav_kanali', 26.5, 21.5, undefined, [['forge_demon', 0, 0], ['fire_priest', -0.02, 1.33], ['fire_priest', -0.86, 1.01]]),
  pack('d2_p21', 'lav_kanali', 33, 21.5, undefined, [['flame_skull', 0.3, 0], ['flame_skull', -0.38, 0.35], ['flame_skull', 0.06, -0.66], ['flame_skull', 0.48, 0.62], ['flame_skull', -0.88, -0.16], ['forge_orc', -0.28, 1.03]]),
  pack('d2_p22', 'k_guney', 29.5, 25.5, undefined, [['forge_demon', 0, 0], ['forge_imp', 0.45, 1.25], ['forge_imp', -0.45, 1.25]]),
  pack('d2_p23', 'k_bati', 22, 32.5, undefined, [['lava_slime', 0.3, 0], ['lava_slime', -0.38, 0.35], ['lava_slime', 0.06, -0.66]], { patrol: [[21, 32.5], [24, 32.5]] }),
  pack('d2_p24', 'kole_kampi', 17, 30, undefined, [['forge_goblin', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', -0.88, -0.16], ['forge_goblin', 0.83, -0.53], ['forge_goblin', -0.28, 1.03], ['forge_goblin', -0.53, -1.02], ['forge_goblin', 1.15, 0.42], ['forge_goblin', -1.2, 0.49]]),
  pack('d2_p25', 'kole_kampi', 12, 30.5, undefined, [['forge_orc', 0.3, 0], ['forge_orc', -0.38, 0.35], ['fire_priest', -1.21, -0.32]]),
  pack('d2_p26', 'kole_kampi', 17, 34, undefined, [['forge_demon', 0.3, 0], ['forge_demon', -0.38, 0.35], ['flame_skull', 0.06, -0.66], ['flame_skull', 0.48, 0.62], ['flame_skull', -0.88, -0.16]]),
  pack('d2_p27', 'kole_kampi', 11.5, 34, undefined, [['magma_golem', 0.3, 0], ['forge_goblin', -0.38, 0.35], ['forge_goblin', 0.06, -0.66], ['forge_goblin', 0.48, 0.62], ['forge_goblin', -0.88, -0.16]]),
  pack('d2_p28', 'k_son', 8, 31.5, undefined, [['forge_orc', 0, 0]]),
];

const PACKS: PackDef[] = PACKS_RAW.map(R.remapPack);

const bossAtNew = (id: string, roomId: string, x: number, z: number, facing: number, order: number) => {
  const [nx, nz] = R.toNew(roomId, x, z);
  return bossAt(id, roomId, nx, nz, facing, order);
};

const BOSSES = [
  bossAtNew('boss_dokumcu_gurz', 'ors_salonu', 15, 5.8, 180, 1),
  bossAtNew('boss_atesyurek', 'magma_kalbi', 30, 33.5, 180, 2),
  bossAtNew('boss_ignaroth', 'mavi_alev_sunagi', 3.5, 33, 90, 3),
];

const THEME: DungeonTheme = {
  fogColor: 0x1a0503, fogNear: 6, fogFar: 34, ambient: 0x4a1a10, ambientIntensity: 0.4, hemiSky: 0x8a2a14, hemiGround: 0x180400,
  torchColor: 0xff6a20, bloomStrength: 0.35, music: 'dungeon_fire', palette: [0x1a0c08, 0x4a2418, 0xff4a10, 0xffb040, 0x3070ff], tint: 0xd8a090,
  moon: { color: 0xff4a20, intensity: 0.35 }, rim: { color: 0x4a68c0, intensity: 0.35 },
};


// ---------------------------------------------------------------------------------------------------------------------
// Decoration (hand placed, GDD coordinates)
// ---------------------------------------------------------------------------------------------------------------------
const FIRE = 0xff6a20;   // forge torches
const LAVA = 0xff4a10;   // lava glow
const BLUE = 0x3070ff;   // Ignaroth's blue fire

const START: [number, number] = [2.5, 19.5];
const FONT: [number, number] = [4, 18];
const EXIT: [number, number] = [3.5, 37];

/** Old-layout point -> new layout (the reserved circles and extras are in the new layout). */
const near = (x: number, z: number, r: number): { x: number; z: number; r: number } => {
  const [nx, nz] = R.at2(x, z);
  return { x: nx, z: nz, r };
};

const ctx = makeCtx('kizil_dokumhane', DOORS, PACKS, [
  near(START[0], START[1], 2.0),
  near(FONT[0], FONT[1], 1.6),
  near(EXIT[0], EXIT[1], 2.8),
  near(15, 5.8, 4.5),     // Dokumcu Gurz
  near(30, 33.5, 5.0),    // Atesyurek
  near(3.5, 33, 4.5),     // Ignaroth
  near(19, 25, 1.5),      // Kudret Sunagi
  near(7.5, 12, 1.5),     // Koruma Sunagi
]);
const decor = decorator(ctx, rectsOf(ROOMS));
/** Room callbacks get the OLD rect and a Props whose at()/wall()/scatter() remap into the new layout. */
const D = {
  out: decor.out,
  room(id: string, fn: (p: Props, r: TileRect) => void): void {
    decor.room(id, (p) => fn(R.remapProps(p, id), oldTileRect(OLD_RECT, id)));
  },
};

const shrine = (p: Props, x: number, z: number, crystal: 'crystal_blue' | 'crystal_purple', color: number, id: string): void => {
  p.at(kg('altar-stone'), x, z, { scale: 3, collide: true, id, tag: 'shrine' });
  p.at(gp(crystal), x, z, { y: 2.0, scale: 0.55, emissive: color, light: lt(color, 1.7, 7, true, 0.7), id: `${id}_crystal` });
  p.ring(dg('candle_lit'), x, z, 0.95, 4, {}, 'out', 45);
};
/** Glowing slag rock with a warm light (lava light "from below"). */
const slag = (p: Props, x: number, z: number, s = 1, color = LAVA, strength = 1.8): Props =>
  p.at(gp('rock_small'), x, z, { scale: s, rot: p.rnd(0, 360), emissive: color, emissiveIntensity: 1.6, light: lt(color, strength, 9, true, 0.4) });
const ingots = (p: Props, x: number, z: number, n = 3): void => {
  for (let i = 0; i < n; i++) p.at(dg('coin_stack_large'), x + (i % 2) * 0.55, z + Math.floor(i / 2) * 0.5, { tint: 0xff8040, emissive: 0xff5a10, emissiveIntensity: 0.6, rot: p.rnd(0, 360), scale: 0.8 });
};
const clutter = (p: Props, n: number, area: { x0: number; z0: number; x1: number; z1: number }): void => {
  p.scatter(n, [hw('bone_A'), hw('bone_B'), dg('coin'), dg('coin_stack_small'), gp('rock_small'), dg('candle_melted'), dg('plate_small'), gp('bone_pile')], area, {}, { minDist: 0.7 });
};

// ---- giris: Kul Kapisi (start) -----------------------------------------------------------------------------------------
D.room('giris', (p, r) => {
  p.at(gp('font_of_power'), FONT[0], FONT[1], { collide: true, id: 'font_of_power', tag: 'socket', light: lt(0xffa050, 2.2, 11, true, 2.0) });
  // the iron double door we came in through (west wall, closed)
  p.wall(r, 'w', [18.4, 20.4], dg('wall_gated'), { tint: 0xb89080 }, 0.15);
  p.at(ks('workbench-anvil'), 1.9, 21.6, { scale: 3, rot: 75, collide: true }).at(ks('workbench-anvil'), 4.4, 21.9, { scale: 3, rot: 110, collide: true });
  p.at(dg('barrel_large'), 1.3, 17.2, { collide: true, tag: 'breakable' }).at(dg('barrel_large'), 2.2, 16.9, { collide: true, tag: 'breakable' }).at(dg('barrel_large'), 1.2, 22.0, { collide: true, tag: 'breakable', rot: 40 });
  p.torches(r, 'n', [1.5, 4.5], FIRE).torches(r, 's', [1.5, 4.5], FIRE).torches(r, 'w', [17.4, 21.4], FIRE);
  p.at(dg('crates_stacked'), 5.0, 16.9, { rot: 100, collide: true, tag: 'breakable' });
  p.at(dg('sword_shield_broken'), 3.2, 16.6, { y: 2.3, rot: 0 });
  clutter(p, 7, Props.inner(r, 0.8));
  slag(p, 2.3, 18.3, 0.8, FIRE, 1.2);
});

// ---- k_giris: Curuf Yolu ---------------------------------------------------------------------------------------------
D.room('k_giris', (p, r) => {
  p.at(ks('resource-stone'), 6.3, 18.9, { scale: 3, rot: 20 }).at(ks('resource-stone-large'), 6.6, 20.2, { scale: 3, rot: 140 }).at(ks('resource-stone'), 9.1, 20.0, { scale: 3, rot: 80 });
  p.at(dg('crates_stacked'), 9.15, 20.3, { rot: 10, collide: true, tag: 'breakable' });
  p.wall(r, 'n', [7.0], dg('sword_shield'), { y: 2.3 }).wall(r, 's', [7.4], dg('sword_shield_broken'), { y: 2.3 });
  p.torches(r, 'n', [8.4], FIRE).torches(r, 's', [6.6], FIRE);
  slag(p, 7.4, 20.2, 0.7);
  p.row(dg('barrier_half'), 6.2, 18.7, 8.8, 18.7, 3, { rot: 0 });   // old minecart rail guard
});

// ---- cevher_deposu: Ore store -----------------------------------------------------------------------------------------
D.room('cevher_deposu', (p, r) => {
  // ore veins in the corners
  p.at(gp('crystal_purple'), 10.3, 14.4, { collide: true, rot: 30 }).at(gp('crystal_purple'), 18.7, 14.3, { collide: true, rot: 140, scale: 0.9 }).at(gp('crystal_purple'), 17.0, 25.0, { collide: true, rot: 250, scale: 1.1 });
  p.at(tw('decoration/props/resource_stone'), 10.6, 24.4, { scale: 6, rot: 20, collide: true }).at(tw('decoration/props/resource_stone'), 11.6, 25.0, { scale: 5, rot: 130 });
  p.at(tw('decoration/props/crate_A_big'), 10.3, 15.4, { scale: 6, rot: 10, collide: true }).at(tw('decoration/props/crate_A_big'), 10.4, 16.5, { scale: 6, rot: 40, collide: true }).at(tw('decoration/props/crate_A_big'), 10.7, 15.9, { scale: 6, y: 1.2, rot: 5 });
  p.at(kf('cart'), 15.2, 14.8, { scale: 4, rot: 90, collide: true }).at(kf('cart'), 14.2, 25.0, { scale: 4, rot: -60, collide: true });
  p.at(dg('crates_stacked'), 12.3, 14.4, { rot: 200, collide: true, tag: 'breakable' }).at(dg('barrel_large_decorated'), 19.0, 19.0, { collide: true, tag: 'breakable' }).at(dg('barrel_large'), 19.0, 20.4, { collide: true, tag: 'breakable' });
  slag(p, 14.3, 20.0, 1.2).at(gp('rock_medium'), 10.2, 21.0, { rot: 60, collide: true });
  slag(p, 17.0, 22.0, 0.9);
  shrine(p, 19.0, 25.0, 'crystal_purple', 0xb060ff, 'shrine_power_1');              // Kudret Sunagi
  p.torches(r, 'n', [10.5, 17.5], FIRE).torches(r, 's', [11.0, 16.4], FIRE).torches(r, 'w', [16.0, 21.5], FIRE).torches(r, 'e', [15.8, 21.0], FIRE);
  p.wall(r, 'w', [18.3], dg('sword_shield'), { y: 2.3 });
  p.at(ks('workbench'), 18.5, 17.8, { scale: 3, rot: -90, collide: true });
  clutter(p, 10, Props.inner(r, 0.9));
});

// ---- k_kuzey: Ors Yolu ---------------------------------------------------------------------------------------------------
D.room('k_kuzey', (p, r) => {
  p.wall(r, 'w', [10.0, 12.4], tw('decoration/props/weaponrack'), { scale: 6 }, 0.35).wall(r, 'e', [9.8, 12.0], tw('decoration/props/weaponrack'), { scale: 6 }, 0.35);
  p.wall(r, 'w', [11.2], dg('sword_shield'), { y: 2.4 }).wall(r, 'e', [11.0], dg('sword_shield_gold'), { y: 2.4 });
  p.torches(r, 'w', [9.4, 12.8], FIRE).torches(r, 'e', [10.4, 12.6], FIRE);
  p.at(gp('chains_hanging'), 14.5, 9.8, { y: 4 });
  slag(p, 13.9, 12.8, 0.7, LAVA, 1.4);
});

// ---- ors_salonu: Boss 1 arena (Dokumcu Gurz) ----------------------------------------------------------------------------
D.room('ors_salonu', (p, r) => {
  p.at(ks('workbench-anvil'), 15, 3.5, { scale: 9, collide: true, id: 'giant_anvil', light: lt(0xff5020, 2.4, 14, true, 3.4) });
  // three crucibles hanging from the ceiling (Erimis Dokum lines at x = 11, 15, 19)
  for (const x of [11, 15, 19]) {
    p.at(gp('chains_hanging'), x, 2.2, { y: 4, scale: 0.4 });
    p.at(gp('cauldron'), x, 2.2, { y: 2.9, scale: 1.3, tag: 'crucible', id: `crucible_${x}`, emissive: LAVA, emissiveIntensity: 0.8, light: lt(LAVA, 1.6, 9, true, 0.8) });
  }
  p.at(ks('structure-canvas'), 9.5, 6.4, { scale: 3, rot: 90, collide: true, id: 'bellows' });                // Korek Esintisi
  p.at(gp('forge'), 9.6, 2.4, { rot: 90, collide: true });
  p.torches(r, 'n', [11.0, 15.0, 19.0], 0xff5020).torches(r, 'w', [3.0, 8.0], 0xff5020).torches(r, 'e', [3.0, 7.5], 0xff5020);
  p.wall(r, 'e', [5.5], dg('banner_triple_red'));
  p.at(gp('brazier'), 19.6, 7.6, { collide: true }).at(gp('brazier'), 10.4, 7.6, { collide: true });
  slag(p, 19.5, 1.5, 1.0).at(dg('rubble_half'), 12.5, 7.7, { rot: 180 });
  p.at(tw('decoration/props/crate_A_big'), 20.0, 4.6, { scale: 6, collide: true, rot: 30 });
  p.at(ks('workbench-grind'), 9.6, 4.6, { scale: 3, rot: 90, collide: true });
  p.at(dg('sword_shield_gold'), 20.2, 3.0, { y: 2.3, rot: -90 });
  p.at(hw('bone_C'), 12.2, 6.6).at(hw('skull'), 17.8, 6.4, { rot: 120 }).at(hw('ribcage'), 14.2, 7.4, { rot: 20 });
  p.at(gp('bone_pile'), 18.4, 2.6, { rot: 50 });
  p.at(dg('pillar_decorated'), 9.2, 8.2, { collide: true, tag: 'pillar', rot: 0 }).at(dg('pillar_decorated'), 20.0, 8.2, { collide: true, tag: 'pillar', rot: 0 });
});

// ---- curuf_ocagi: Slag furnace (optional) -----------------------------------------------------------------------------
D.room('curuf_ocagi', (p, r) => {
  p.at(dg('rubble_large'), 1.0, 8.0, { rot: 100, collide: true, scale: 0.8 }).at(dg('rubble_large'), 7.0, 4.4, { rot: -30, collide: true, scale: 0.7 }).at(dg('rubble_half'), 4.4, 11.8, { rot: 0, collide: true });
  p.at(dg('barrel_large_decorated'), 7.4, 9.0, { collide: true, tag: 'breakable' }).at(dg('barrel_large'), 7.4, 10.1, { collide: true, tag: 'breakable' });
  p.at(gp('chest_gold'), 1.2, 12.0, { rot: 30, collide: true, id: 'chest_curuf', tag: 'chest' });
  shrine(p, 7.5, 12.0, 'crystal_blue', 0x60a0ff, 'shrine_ward_1');                  // Koruma Sunagi
  slag(p, 2.0, 4.5, 1.0).at(gp('rock_medium'), 5.0, 3.9, { rot: 200, collide: true });
  slag(p, 4.2, 8.4, 0.9);
  p.at(gp('crystal_purple'), 7.6, 6.8, { collide: true, scale: 0.8 });
  p.torches(r, 's', [2.5, 5.5], FIRE).torches(r, 'w', [8.0], FIRE);
  clutter(p, 9, Props.inner(r, 0.9));
});

// ---- k_dogu1: Kizgin Dehliz ----------------------------------------------------------------------------------------
D.room('k_dogu1', (p, r) => {
  p.at(dg('keg'), 21.3, 2.9, { collide: true, tag: 'breakable' }).at(dg('keg'), 21.3, 4.2, { collide: true, tag: 'breakable', rot: 90 }).at(dg('keg_decorated'), 23.9, 2.8, { collide: true, tag: 'breakable', rot: 180 });
  p.at(dg('bottle_C_brown'), 22.0, 2.7).at(dg('plate_small'), 24.0, 4.1);
  p.at(gp('rock_small'), 22.4, 4.2, { vfx: 'ambient_embers', emissive: LAVA, light: lt(LAVA, 1.4, 8, true, 0.4) });   // steam / ember vent
  p.torches(r, 'n', [22.0], FIRE).torches(r, 's', [23.4], FIRE);
});

// ---- kalip_atolyesi: Casting workshop --------------------------------------------------------------------------------
D.room('kalip_atolyesi', (p, r) => {
  // mould benches
  for (const [x, z, rot] of [[26.6, 4.6, 0], [29.4, 4.4, 0], [32.0, 4.6, 0], [26.5, 0.9, 90], [30.0, 0.6, 90], [33.2, 4.3, 90]] as [number, number, number][]) {
    p.at(dg('table_long'), x, z, { rot, collide: true, scale: 0.8 });
  }
  p.at(dg('table_medium_broken'), 28.0, 3.4, { rot: 30, collide: true }).at(dg('table_medium_broken'), 31.4, 3.2, { rot: -40, collide: true });
  p.at(ks('workbench'), 25.5, 7.6, { scale: 3, rot: 45, collide: true }).at(ks('workbench'), 28.6, 7.8, { scale: 3, rot: 0, collide: true }).at(ks('workbench'), 34.0, 7.6, { scale: 3, rot: -45, collide: true });
  p.at(ks('workbench-grind'), 31.0, 7.8, { scale: 3, rot: 180, collide: true }).at(ks('workbench-grind'), 25.4, 4.0, { scale: 3, rot: 90, collide: true });
  ingots(p, 26.0, 5.5, 3); ingots(p, 33.6, 5.6, 2); ingots(p, 29.0, 1.6, 4);
  p.at(gp('anvil'), 31.0, 5.2, { rot: 40, collide: true }).at(gp('forge'), 34.0, 0.9, { rot: 180, collide: true });
  p.torches(r, 'n', [26.0, 28.5, 31.0, 33.5], FIRE).torches(r, 's', [26.0, 33.0], FIRE).torches(r, 'w', [2.0, 6.4], FIRE).torches(r, 'e', [1.6, 6.2], FIRE);
  p.wall(r, 's', [30.0], dg('banner_shield_red'));
  p.at(gp('chains_hanging'), 29.5, 3.2, { y: 4 }).at(gp('chains_hanging'), 32.0, 6.5, { y: 4 });
  slag(p, 25.2, 2.2, 0.9).at(dg('barrel_large'), 34.2, 3.0, { collide: true, tag: 'breakable' });
  clutter(p, 8, Props.inner(r, 0.9));
});

// ---- k_inis: Kizgin Merdivenler -----------------------------------------------------------------------------------
D.room('k_inis', (p, r) => {
  p.at(dg('stairs_wall_left'), 29.0, 8.8, { rot: 0, scale: 0.6 }).at(dg('stairs_wall_right'), 30.0, 8.8, { rot: 0, scale: 0.6 });
  slag(p, 29.0, 12.8, 1.0, LAVA, 2.6).at(gp('rock_small'), 30.0, 13.0, { rot: 130, emissive: LAVA });
  p.torches(r, 'w', [9.6, 12.0], FIRE).torches(r, 'e', [10.4, 12.6], FIRE);
});

// ---- lav_kanali: lava river --------------------------------------------------------------------------------------------
D.room('lav_kanali', (p, r) => {
  // two wooden bridges over the river (tiles 26-27 and 32-33)
  for (const bx of [26, 27, 32, 33]) for (const bz of [18, 19]) p.at(dg('floor_wood_large_dark'), bx, bz, { y: 0.03 });
  for (const bx of [25.5, 27.5, 31.5, 33.5]) p.at(dg('barrier_half'), bx, 17.6, { rot: 90 }).at(dg('barrier_half'), bx, 19.4, { rot: 90 });
  p.at(gp('chains_hanging'), 26.5, 17.0, { y: 4 }).at(gp('chains_hanging'), 32.5, 20.2, { y: 4 }).at(gp('chains_hanging'), 29.6, 14.3, { y: 4 });
  p.at(gp('rock_large'), 24.4, 14.4, { rot: 20, collide: true }).at(gp('rock_medium'), 34.8, 22.8, { rot: 150, collide: true }).at(gp('rock_medium'), 24.0, 23.0, { rot: 60, collide: true });
  for (const [x, z] of [[28.2, 17.4], [30.6, 20.3], [34.6, 17.6], [24.6, 20.4]] as [number, number][]) slag(p, x, z, 1.1, LAVA, 2.2);
  p.torches(r, 'n', [25.0, 28.0, 33.0], FIRE).torches(r, 's', [25.0, 27.0, 33.0], FIRE).torches(r, 'w', [16.0, 21.0], FIRE).torches(r, 'e', [16.0, 21.0], FIRE);
  p.at(dg('crates_stacked'), 35.0, 14.4, { rot: 200, collide: true, tag: 'breakable' }).at(dg('barrel_large'), 24.1, 22.6, { collide: true, tag: 'breakable' });
  clutter(p, 8, Props.inner(r, 1.0));
});

// ---- k_guney: Zincir Gecidi ----------------------------------------------------------------------------------------------
D.room('k_guney', (p, r) => {
  p.at(gp('chains_hanging'), 29.0, 24.6, { y: 4 }).at(gp('chains_hanging'), 30.0, 26.6, { y: 4 }).at(gp('chains_hanging'), 29.5, 23.9, { y: 4, scale: 0.8 });
  p.wall(r, 'w', [24.8, 26.6], kg('iron-fence'), { scale: 3, y: 0 }, 0.3).wall(r, 'e', [25.4, 26.9], kg('iron-fence'), { scale: 3, y: 0 }, 0.3);
  p.at(gp('iron_cage'), 28.9, 24.4, { rot: 90, collide: true, scale: 0.9 });
  p.at(gp('bone_pile'), 30.0, 24.2).at(hw('skull'), 29.1, 24.0);
  p.torches(r, 'w', [25.8], FIRE).torches(r, 'e', [24.6], FIRE);
});

// ---- kopru: Lav Koprusu ---------------------------------------------------------------------------------------------------
D.room('kopru', (p, r) => {
  p.row(dg('barrier_half'), 34.0, 23.9, 35.0, 27.1, 4, { rot: 90 });
  p.row(dg('barrier_half'), 35.0, 23.9, 35.0, 27.1, 4, { rot: 90 });
  slag(p, 34.0, 25.0, 0.9, LAVA, 2.4).at(gp('rock_small'), 35.0, 26.3, { emissive: LAVA, rot: 70 });
  p.at(gp('chains_hanging'), 34.5, 25.5, { y: 4 });
});

// ---- magma_kalbi: Boss 2 arena (Magma Devi Atesyurek) --------------------------------------------------------------------
D.room('magma_kalbi', (p, r) => {
  // four cooling vents (Sogutma Menfezi)
  [[27, 30], [33, 30], [27, 36], [33, 36]].forEach(([x, z], i) => {
    p.at(dg('floor_tile_big_grate'), x, z, { y: 0.03, id: `vent_${i + 1}`, tag: 'vent', vfx: 'ambient_dust', light: lt(0x80c0ff, 0.9, 6, true, 0.6) });
  });
  // basalt rim of the platform: broken pillars and slag
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 + 12) * Math.PI) / 180;
    p.at(i % 3 === 0 ? gp('pillar_broken') : gp('rock_medium'), 30 + Math.sin(a) * 4.2, 33 + Math.cos(a) * 4.2, { rot: (a * 180) / Math.PI, collide: i % 2 === 0, scale: i % 3 === 0 ? 0.8 : 1.0 });
  }
  for (let i = 0; i < 6; i++) { const a = (i * 60 + 30) * Math.PI / 180; slag(p, 30 + Math.sin(a) * 4.8, 33 + Math.cos(a) * 4.8, 1.4, LAVA, 2.8); }
  p.torches(r, 'n', [26.0, 34.0], 0xff5020);
  p.at(hw('ribcage'), 28.4, 33.0, { rot: 40 }).at(hw('skull'), 31.8, 35.4).at(gp('bone_pile'), 31.0, 31.0, { rot: 90 });
  p.at(dg('rubble_half'), 25.2, 33.6, { rot: 90 });
});

// ---- k_bati: Kole Yolu ---------------------------------------------------------------------------------------------------
D.room('k_bati', (p, r) => {
  p.at(ks('bedroll'), 20.6, 32.0, { scale: 3, rot: 20 }).at(ks('bedroll'), 21.8, 33.0, { scale: 3, rot: 100 }).at(ks('bedroll'), 20.4, 33.1, { scale: 3, rot: 170 });
  p.at(gp('chains_hanging'), 21.0, 32.4, { y: 4 }).at(gp('chains_hanging'), 23.6, 32.0, { y: 4, scale: 0.8 });
  p.at(hw('bone_A'), 23.0, 33.0, { rot: 30 }).at(dg('plate_small'), 20.8, 32.6, { y: 0.02 }).at(dg('candle_melted'), 23.8, 31.9);
  p.torches(r, 'n', [22.0], FIRE).torches(r, 's', [21.0], FIRE);
});

// ---- kole_kampi: Slave camp -----------------------------------------------------------------------------------------------
D.room('kole_kampi', (p, r) => {
  for (const [x, z, rot] of [[9.6, 28.5, 160], [18.2, 28.4, 200], [9.8, 36.0, 20], [18.4, 36.1, -20]] as [number, number, number][]) p.at(ks('tent'), x, z, { scale: 3, rot, collide: true });
  p.at(ks('campfire-pit'), 14.0, 31.0, { scale: 3, collide: true, light: lt(0xff7a2a, 2.4, 11, true, 0.6), vfx: 'ambient_embers' }).at(ks('campfire-pit'), 13.6, 33.4, { scale: 3, collide: true, light: lt(0xff7a2a, 2.2, 10, true, 0.6) });
  for (const [x, z, rot] of [[13.0, 30.3, 10], [15.0, 30.2, 100], [12.8, 32.6, 70], [14.6, 34.4, 200], [12.2, 34.0, 130], [15.2, 32.4, 300]] as [number, number, number][]) p.at(ks('bedroll'), x, z, { scale: 3, rot });
  p.at(tw('decoration/props/wheelbarrow'), 9.5, 32.8, { scale: 6, rot: 70, collide: true }).at(tw('decoration/props/sack'), 9.4, 34.2, { scale: 6, rot: 20 }).at(tw('decoration/props/sack'), 10.2, 34.4, { scale: 6, rot: 120 });
  // goblin prisoners in iron cages (rescue for 25 gold)
  [[18.2, 31.6, 90], [18.2, 33.2, 90], [10.0, 30.6, -90]].forEach(([x, z, rot], i) => {
    p.at(gp('iron_cage'), x, z, { rot, collide: true, tag: 'cage', id: `cage_${i + 1}` });
    p.at(mon('Goblin'), x, z, { scale: 0.59, pose: 'Idle', rot: rot + 180, id: `prisoner_${i + 1}` });
  });
  p.at(gp('chains_hanging'), 15.8, 31.6, { y: 4 }).at(gp('chains_hanging'), 11.0, 34.0, { y: 4 }).at(gp('chains_hanging'), 16.4, 28.2, { y: 4 });
  p.at(dg('barrel_large'), 19.0, 31.0, { collide: true, tag: 'breakable' }).at(dg('crates_stacked'), 9.0, 29.2, { collide: true, rot: 40, tag: 'breakable' });
  p.torches(r, 'n', [11.0, 17.0], FIRE).torches(r, 's', [11.0, 17.0], FIRE);
  clutter(p, 9, Props.inner(r, 0.9));
});

// ---- k_son: Mavi Alev Kapisi ------------------------------------------------------------------------------------------------
D.room('k_son', (p, r) => {
  // the 1-tile gate passage is 2 wide now: the flanking columns move to the side walls (old z 31.5 = the passage row)
  p.torches(r, 'w', [31.5], BLUE).torches(r, 'e', [31.5], BLUE);
  p.at(gp('chains_hanging'), 8.0, 31.5, { y: 4 });
  p.at(dg('candle_lit'), 8.3, 31.2, { light: lt(BLUE, 1.2, 6, true, 0.8) }).at(gp('rock_small'), 8.2, 31.6, { rot: 40 });
});

// ---- mavi_alev_sunagi: Boss 3 arena (Mavi Alev Ignaroth) ----------------------------------------------------------------
D.room('mavi_alev_sunagi', (p, r) => {
  p.at(hw('shrine'), 3.5, 38.0, { tint: 0x203060, scale: 1.6, collide: true, id: 'demonic_altar', emissive: BLUE, emissiveIntensity: 0.5, light: lt(BLUE, 2.2, 12, true, 2.6) });
  // 2x3 vent grid used in phase 2
  for (const x of [2, 5]) for (const z of [29.5, 32.5, 35.5]) p.at(dg('floor_tile_big_grate'), x, z, { y: 0.03, tag: 'vent', id: `vent_${x}_${z}` });
  // six blue braziers
  for (const [x, z] of [[0.2, 28.0], [0.2, 33.0], [0.2, 38.0], [7.0, 28.0], [7.0, 36.0], [3.5, 26.8]] as [number, number][]) {
    p.at(dg('column'), x, z, { collide: true }).at(kg('fire-basket'), x, z, { y: 1.4, scale: 3, light: lt(BLUE, 2.4, 12, true, 0.8), emissive: BLUE });
  }
  p.at(gp('chains_hanging'), 2.0, 31.0, { y: 4 }).at(gp('chains_hanging'), 5.0, 34.0, { y: 4 }).at(gp('chains_hanging'), 3.5, 28.5, { y: 4 });
  slag(p, 1.0, 36.0, 1.0, BLUE, 1.8).at(gp('rock_small'), 6.6, 34.6, { emissive: BLUE, rot: 20 });
  slag(p, 6.5, 30.0, 1.0, BLUE, 1.8);
  p.at(gp('pillar_broken'), 6.6, 37.6, { collide: true, rot: 30, scale: 0.8 }).at(gp('pillar_broken'), 0.4, 30.5, { collide: true, rot: 200, scale: 0.8 });
  p.at(hw('skull'), 2.6, 38.0, { rot: 20 }).at(hw('ribcage'), 4.6, 37.9, { rot: 100 }).at(gp('bone_pile'), 5.8, 38.0, { rot: 60 });
  p.torches(r, 'n', [3.5], BLUE).torches(r, 's', [2.0, 5.5], BLUE);
});

// ---------------------------------------------------------------------------------------------------------------------
// Zones, per-room extras, pack flags, assembly
// ---------------------------------------------------------------------------------------------------------------------
const lavaZone = (x: number, z: number, w: number, h: number, hazard = false, blocked = true): ZoneDef =>
  rectZone('lava', x, z, w, h, { blocked, color: 0x7a1a05, glow: LAVA, glowIntensity: 1.5, ...(hazard ? { hazard: { coef: 1.5, interval: 0.5 } } : {}) });

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { ambientVfx: 'ambient_embers' },
  k_giris: { ambientVfx: 'ambient_embers' },
  cevher_deposu: { ambientVfx: 'ambient_embers' },
  k_kuzey: { ambientVfx: 'ambient_embers' },
  ors_salonu: {
    explicitDecor: true, lightColor: 0xff5020, ambientVfx: 'ambient_embers',
    // the south wall is lava except the entrance from the Ore Road (x 13-16)
    zones: [lavaZone(9, 0, 12, 1, true, false), lavaZone(9, 11, 4, 1, true, false), lavaZone(17, 11, 4, 1, true, false)],
  },
  curuf_ocagi: { ambientVfx: 'ambient_embers', zones: [lavaZone(2, 5, 2, 2)] },
  k_dogu1: { ambientVfx: 'ambient_embers' },
  kalip_atolyesi: {
    ambientVfx: 'ambient_embers',
    // the raised gantry along the north wall (2 m), reached by a ramp off the workshop floor
    heightAreas: [{ id: 'kalip_gantry', rect: { x: 26, z: 0, w: 9, h: 3 }, y: 2, rim: 'rail' as const, floor: 'stone' as const }],
    slopes: [{ id: 'kalip_ramp', kind: 'ramp' as const, rect: { x: 30, z: 3, w: 2, h: 2 }, axis: 'z' as const, yFrom: 2, yTo: 0, style: 'stone' as const }],
  },
  k_inis: { ambientVfx: 'ambient_embers', lightColor: LAVA },
  lav_kanali: {
    ambientVfx: 'ambient_embers', lightColor: LAVA,
    // river through tile rows 18-19; the two bridges (x 26-27, 32-33) are the gaps between the lava pieces
    zones: [
      lavaZone(24, 18, 2, 2), lavaZone(28, 18, 4, 2), lavaZone(34, 18, 2, 2),
      rectZone('bridge', 26, 18, 2, 2, { color: 0x3a2a1a }), rectZone('bridge', 32, 18, 2, 2, { color: 0x3a2a1a }),
    ],
  },
  k_guney: { ambientVfx: 'ambient_embers' },
  kopru: {
    ambientVfx: 'ambient_embers', lightColor: LAVA,
    zones: [rectZone('bridge', 34, 24, 2, 4, { color: 0x3a2a1a })],
    hazards: [{ kind: 'lava_burst', interval: 4, warn: 1.2, radius: 2.0, coef: 2.0, vfx: 'volcanic_plume' }],
  },
  magma_kalbi: {
    explicitDecor: true, lightColor: LAVA, ambientVfx: 'ambient_embers',
    // the whole room is lava, then the platform (r = 16 m) and the two walkways from the doors re-open the floor (zones apply in order)
    zones: [
      rectZone('lava', 25, 28, 14, 14, { blocked: true, color: 0x7a1a05, glow: LAVA, glowIntensity: 1.5, light: { color: LAVA, intensity: 1.5, distance: 24, flicker: true, y: 1 } }),
      circleZone('dais', ...R.at2(30, 33), 4.4, { blocked: false, color: 0x1e1612 }),
      rectZone('bridge', 28, 28, 4, 2, { color: 0x1e1612 }), rectZone('bridge', 34, 28, 2, 5, { color: 0x1e1612 }),
      rectZone('bridge', 25, 31, 3, 4, { color: 0x1e1612 }),   // walkway from the platform to the west (boss_exit) door
    ],
  },
  k_bati: { ambientVfx: 'ambient_embers' },
  kole_kampi: { ambientVfx: 'ambient_embers' },
  k_son: { lightColor: BLUE },
  mavi_alev_sunagi: { explicitDecor: true, lightColor: BLUE, ambientVfx: 'ambient_embers' },
};

const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  d2_p02: { big: true, note: 'Nine goblins and an orc on the cevher floor: the designed big pull.' },
  d2_p04: { linkedTo: ['d2_p05'], note: 'Linked pair with the slag golem in the same lane: pulling one pulls both.' },
  d2_p05: { dormant: { kind: 'statue', wakeRadius: 6 }, note: 'Dormant slag golem (statue): wakes when a player comes within 6 m.' },
  d2_p06: { note: 'Patrol runs W-E between the four packs and links whatever it touches.' },
  d2_p15: { dormant: { kind: 'statue', wakeRadius: 6 }, note: 'Dormant slag golem on the casting floor.' },
  d2_p18: { note: 'Imps patrol the lava river and pelt both bridges; killing them opens the bridge gate (kopru).' },
  d2_p24: { big: true, note: 'Ten goblins at the slave camp: the second designed big pull.' },
};
/** Room atmospheres (fog blend): calm in the forge entry, tension in the lava rooms, set piece in the three boss rooms. */
const ATMOSPHERES = {
  calm: { color: 0x1a0503, near: 6, far: 34 },
  tension: { color: 0x280802, near: 5, far: 28 },
  set_piece: { color: 0x330a02, near: 7, far: 30 },
};
const ATMO: Record<string, string> = {
  giris: 'calm', k_giris: 'calm', cevher_deposu: 'calm', ors_salonu: 'set_piece', lav_kanali: 'tension', kole_kampi: 'tension',
  magma_kalbi: 'set_piece', mavi_alev_sunagi: 'set_piece',
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(...R.at2(FONT[0], FONT[1])),
  shrines: [{ type: 'shrine_power', pos: pt(...R.at2(19, 25)) }, { type: 'shrine_ward', pos: pt(...R.at2(7.5, 12)) }],
  riftSpots: ([[15, 19.5], [29.5, 4], [6, 8], [30, 16], [14, 32], [8, 19.5]] as [number, number][]).map(([x, z]) => pt(...R.at2(x, z))),
  chests: [{ pos: pt(...R.at2(1.2, 12.0)), kind: 'chest_gold' }],
  checkpoints: [pt(...R.at2(22.5, 32.5))],
};

/** Props standing inside a height area with no explicit y are set to that area's top (the gantry floor and its benches). */
function liftOnDais(rooms: RoomDef[]): RoomDef[] {
  return rooms.map((r) => {
    const areas = r.heightAreas ?? [];
    if (areas.length === 0 || !r.props) return r;
    const props = r.props.map((p) => {
      if (p.y !== undefined) return p;
      const [x, z] = p.pos;
      const a = areas.find((h) => x >= h.rect.x && x <= h.rect.x + h.rect.w && z >= h.rect.z && z <= h.rect.z + h.rect.h);
      return a ? { ...p, y: a.y } : p;
    });
    return { ...r, props };
  });
}

export const KIZIL_DOKUMHANE: DungeonDef = {
  id: 'kizil_dokumhane',
  name: 'Kızıl Dökümhane',
  shortName: 'Dökümhane',
  lore: 'Dağın kalbinde, Kuzgunkale\'nin ilk silahlarının döküldüğü dökümhane şimdi Mavi Alev Ignaroth\'un elinde. Köleleştirilmiş goblinler gece gündüz örslerde çalışırken, Dökümcü Usta Gurz kırbacını şaklatır ve Magma Devi Ateşyürek lav gölünde uyur. Kızıl ateşin altında, mavi bir alev büyüyor.',
  levelRange: [18, 28],
  timerSec: 860,
  forcesRequired: 245, // floor(0.8 x 307 total pack forces, auto sums)
  theme: THEME,
  grid: { w: 40, h: 62 },
  vertical: true,
  rooms: liftOnDais(withProps(ROOMS.map((r) => ({ ceiling: 10, ...r, ...ROOM_EXTRA[r.id], ...(ATMO[r.id] ? { atmosphere: ATMO[r.id] } : {}) })), D.out)),
  atmospheres: ATMOSPHERES,
  doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)),
  bosses: BOSSES,
  start: { pos: shPt(...R.at2(START[0], START[1])), facing: 90 },
  exit: { pos: shPt(...R.at2(EXIT[0], EXIT[1])) },
  extras: EXTRAS,
};
