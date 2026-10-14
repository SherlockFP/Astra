import type { DecorTier, DoorDef, DungeonDef, DungeonTheme, HeightArea, LiftDef, PackDef, PropPlacement, RoomDef, SlopeDef, TileRect } from '../../types/dungeons';
import '../enemies_buyucu_terasi';
import type { PO, PackExtra } from './kit';
import { bossAt, circleZone, dg, door, fu, gp, hw, ip, kc, kf, kg, kn, lt, pack, pt, rectZone, room, stairs, ramp } from './kit';

/**
 * BUYUCU TERASI (buyucu_terasi), Season 1 Mythic+ dungeon (Magisters' Terrace model). Design: docs/dungeons/buyucu_terasi.md
 * (rooms 3.2, heights 3.2b, doors 3.3, packs 4.3, bosses 5, timer and route 6, appendix A for this file).
 * Heights follow docs/ENGINE_VERTICALITY.md: vertical: true, four walkable levels (0 / 2.7 / 5.4 / 13.5 m), stair strips, one
 * ledge, a grand stair, two lifts and a void chasm with two bridges (the orrery platform).
 *
 * Fallbacks in this file (the design's new styles, props and statuses do not exist yet): floors `marble` and walls `arcane` /
 * `library` are the `temple` / `temple` styles; every new Blender prop is its listed fallback model; the Tome and crystal boons
 * use the Tome only (crystal_power is not a StatusId); the gaze patrol (GazePatrol), the librarian watchers and the Güneş Kuyusu
 * light shaft are not built. Registration: src/data/dungeons/index.ts (see the report).
 */

const TILE = 4;
const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const P = (model: string, x: number, z: number, o: PO = {}): PropPlacement => ({ model, pos: [x, z], ...o });
const area = (id: string, x: number, z: number, w: number, h: number, y: number, rim: HeightArea['rim'] = 'none'): HeightArea => ({
  id, rect: rect(x, z, w, h), y, rim,
});
const tier = (kind: DecorTier['kind'], y: number, x: number, z: number, w: number, h: number, extra: Partial<DecorTier> = {}): DecorTier => ({
  kind, y, rect: rect(x, z, w, h), ...extra,
});
const fog = (color: number, near: number, far: number) => ({ color, near, far });

/** Design sunflower of section 4.3 (tile offsets from the pack centre; melee first, casters last). */
const SPIRAL: [number, number][] = [
  [0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53],
  [-0.28, 1.03], [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.58, -1.23], [0.43, 1.36],
];
/** Pack of `counts` [enemyId, n] pairs laid on the spiral (the same helper shape as peri_sisleri.ts). */
function packN(id: string, roomId: string, cx: number, cz: number, counts: [string, number][], extra: PackExtra = {}): PackDef {
  const ids = counts.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  if (ids.length > SPIRAL.length) throw new Error(`[buyucu_terasi] pack ${id}: ${ids.length} members, spiral holds ${SPIRAL.length}`);
  return pack(id, roomId, cx, cz, undefined, ids.map((enemyId, i) => [enemyId, SPIRAL[i][0], SPIRAL[i][1]] as [string, number, number]), extra);
}

// ---- levels (absolute metres) -------------------------------------------------------------------------------------------------
const L0 = 0, L1 = 2.7, L2 = 5.4, L3 = 13.5;

// ---- slopes ---------------------------------------------------------------------------------------------------------------------
const ST_ARSIV_UST: SlopeDef = stairs(rect(17, 25, 4, 2), 'z', L1, L0, { id: 'st_arsiv_ust', style: 'stone' });
const ST_UST_MEYDAN: SlopeDef = stairs(rect(26, 23, 2, 4), 'x', L1, L2, { id: 'st_ust_meydan', style: 'stone' });
const GRAND_STAIR: SlopeDef = stairs(rect(28, 41, 8, 8), 'z', L2, L0, { id: 'grand_stair', style: 'carpet', color: 0x8a1c30 });
const ST_AVLU_SIG: SlopeDef = stairs(rect(55, 14, 4, 4), 'z', L2, L1, { id: 'st_avlu_sig', style: 'stone' });

// ---- chasm: the orrery floats above a void ring (real fall, ENGINE_VERTICALITY ZoneDef.fall) ---------------------------------
const VOID_RING = { fall: 'open', depth: 30, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.9 } as const;

// ---- rooms (18) -----------------------------------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  room('giris', 'Sessiz Fuaye', 14, 62, 12, 8, 'temple', 'temple', 0.3, {
    floorY: L0, ceiling: 14, explicitDecor: true, lightColor: 0xf2a14a,
    tiers: [tier('windows', 6, 14, 63, 1, 6, { count: 3, spacing: 2 }), tier('beams', 13, 14, 62, 12, 8)],
    zones: [circleZone('rune', 19.5, 65, 1.7, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })],
    props: [
      P(gp('font_of_power'), 19.5, 65, { id: 'font_of_power', tag: 'socket', tint: 0xb8f0ff, light: lt(0x5fd3e8, 2.2, 12, false) }),
      P(gp('brazier'), 17.5, 65, { light: lt(0xf2a14a, 1.8, 10, true) }), P(gp('brazier'), 21.5, 65, { light: lt(0xf2a14a, 1.8, 10, true) }),
      P(ip('psx-dungeon', 'chandelier'), 17, 65, { y: 11, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 22, 65, { y: 11 }),
      P(fu('rug_rectangle_stripes_A'), 19.5, 64, { tint: 0x8a1c30 }),
      P(dg('banner_patternB_red'), 14.4, 64, { y: 6 }), P(dg('banner_patternB_red'), 14.4, 68, { y: 6 }),
      P(dg('banner_shield_yellow'), 25.4, 68.5, { y: 6 }),
      P(gp('statue_hooded'), 16, 67.4, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(gp('statue_hooded'), 23, 67.4, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(fu('table_medium'), 23.5, 64, { rot: 90 }), P(fu('book_set'), 23.5, 64),
      P(dg('torch_mounted'), 14.2, 62.8, { y: 2.5 }), P(dg('torch_mounted'), 25.3, 62.8, { y: 2.5 }),
    ],
  }),
  room('guney_antre', 'Güney Antre Salonu', 12, 50, 16, 12, 'temple', 'temple', 0.4, {
    floorY: L0, ceiling: 18, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x1d1a3a, 10, 52),
    tiers: [
      tier('gallery', 6.5, 12, 50, 16, 12, { depth: 3 }), tier('colonnade', 6.5, 13, 51, 14, 10, { count: 8 }),
      tier('windows', 11, 12, 51, 1, 10, { count: 4, spacing: 2.5 }), tier('windows', 11, 27, 51, 1, 10, { count: 4, spacing: 2.5 }),
    ],
    zones: [rectZone('rune', 19, 51, 1, 11, { color: 0x4a3a1a, glow: 0xf2a14a, glowIntensity: 0.25 })],
    props: [
      P(kg('column-large'), 13.2, 52, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 13.2, 58, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 26.8, 52, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 26.8, 58, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(ip('psx-dungeon', 'chandelier'), 19.5, 53, { y: 14, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 19.5, 58, { y: 14, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(gp('statue_hooded'), 15.7, 50.7, { tint: 0x6a6a90 }), P(gp('statue_hooded'), 19.3, 50.7, { tint: 0x6a6a90 }),
      P(gp('lamp_post'), 19.5, 52, { light: lt(0xf2a14a, 1.4, 8, true) }), P(gp('lamp_post'), 19.5, 59.5, { light: lt(0xf2a14a, 1.4, 8, true) }),
      P(dg('banner_patternB_red'), 12.3, 53, { y: 6 }), P(dg('banner_patternB_red'), 12.3, 56, { y: 6 }), P(dg('banner_patternB_red'), 27.7, 56, { y: 6 }),
      P(dg('candle_thin'), 15, 60), P(dg('candle_thin'), 24, 51),
    ],
  }),
  room('lycaneum', 'Lycaneum Geçidi', 14, 41, 10, 9, 'temple', 'temple', 0.1, {
    floorY: L0, ceiling: 12, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x2a1a38, 8, 40),
    tiers: [tier('gallery', 5, 14, 41, 10, 2, { depth: 2 })],
    props: [
      P(fu('shelf_A_big'), 18.5, 47.25, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 22.5, 47.25, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(gp('statue_hooded'), 14.6, 45, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(gp('statue_hooded'), 23.2, 48, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(fu('table_small'), 14.2, 42.45, { id: 'tome_lectern' }), P(fu('book_set'), 14.2, 42.45),
      P(fu('lamp_standing'), 15, 48.75, { light: lt(0xf2a14a, 1.3, 8, true) }), P(fu('lamp_standing'), 23, 42.75, { light: lt(0xf2a14a, 1.3, 8, true) }),
      P(ip('psx-dungeon', 'chain'), 17, 42, { y: 11 }), P(ip('psx-dungeon', 'chain'), 21, 42, { y: 11 }),
    ],
  }),
  room('gizem_arsivi', 'Gizem Arşivi', 10, 27, 16, 14, 'temple', 'temple', 0.3, {
    floorY: L0, ceiling: 26, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x2a1a38, 8, 56),
    tiers: [
      tier('gallery', 7.5, 10, 27, 16, 14, { depth: 3 }), tier('gallery', 14, 10, 27, 16, 14, { depth: 2 }),
      tier('colonnade', 7.5, 11, 28, 14, 12, { count: 8 }), tier('windows', 19, 10, 27, 16, 1, { count: 4, spacing: 3.5 }),
      tier('beams', 24, 10, 27, 16, 14),
    ],
    zones: [circleZone('void', 12.5, 29, 0.9, { color: 0x1a0d2a, glow: 0x8a3cff, glowIntensity: 0.5, vfx: 'shadow_ground' })],
    props: [
      P(fu('shelf_A_big'), 11.2, 33, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 11.2, 39, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('shelf_A_big'), 24.8, 33, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 24.8, 39, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('table_medium_long'), 12, 32.5, { rot: 90 }), P(fu('table_medium_long'), 23.5, 32.5, { rot: 90 }),
      P(fu('armchair'), 16, 39.2, { tint: 0x8a1c30, id: 'velvet_throne', rot: 180 }),
      P(ip('psx-dungeon', 'chandelier'), 14, 32, { y: 20, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 22, 32, { y: 20, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(fu('lamp_standing'), 18, 34, { light: lt(0xf2a14a, 1.3, 8, true) }), P(fu('lamp_standing'), 20, 29, { light: lt(0xf2a14a, 1.3, 8, true) }),
      P(fu('chair_A'), 12, 37, { rot: 90 }), P(fu('chair_A'), 23.5, 37, { rot: 270 }),
      P(fu('rug_rectangle_stripes_A'), 17, 39, { tint: 0x8a1c30 }),
      P(hw('lantern_hanging'), 16, 35, { y: 11 }), P(hw('lantern_hanging'), 20, 35, { y: 11 }),
      P(dg('banner_patternC_red'), 10.4, 31, { y: 9 }), P(dg('banner_patternC_red'), 25.6, 31, { y: 9 }),
    ],
  }),
  room('yasak_raflar', 'Yasak Raflar', 1, 28, 9, 10, 'temple', 'temple', 0.3, {
    floorY: L0, ceiling: 20, optional: true, lightColor: 0xf2a14a, fog: fog(0x1a1030, 6, 40),
    tiers: [tier('gallery', 8, 1, 28, 9, 10, { depth: 1.5 })],
    props: [
      P(fu('shelf_A_big'), 5.23, 36.5, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('table_small'), 5.68, 31, { id: 'chained_book' }), P(fu('book_set'), 5.68, 31),
      P(ip('psx-dungeon', 'chain'), 5, 30, { y: 16 }), P(ip('psx-dungeon', 'chain'), 7.25, 32, { y: 16 }),
      P(gp('chest_iron'), 3.88, 34.5), P(hw('lantern_hanging'), 6.13, 33, { y: 13, light: lt(0xf2a14a, 1.4, 8, true) }),
      P(fu('pictureframe_medium'), 9.2, 29, { y: 3 }),
    ],
  }),
  room('ust_kutuphane', 'Üst Kütüphane', 10, 13, 16, 14, 'wood', 'temple', 0.3, {
    floorY: L1, ceiling: 20, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x2a1a38, 8, 50),
    slopes: [ST_ARSIV_UST],
    tiers: [
      tier('gallery', 9.5, 10, 13, 16, 14, { depth: 3 }), tier('windows', 14, 10, 13, 16, 1, { count: 6, spacing: 2.5 }),
      tier('beams', 18, 10, 13, 16, 14),
    ],
    zones: [rectZone('rune', 14, 17, 1, 1, { color: 0x1c1024, glow: 0x8a3cff, glowIntensity: 0.6 })],
    props: [
      P(kc('wall-half'), 16.6, 24.5, { collide: true }), P(kc('wall-half'), 19.4, 24.5, { collide: true }),
      P(fu('shelf_A_big'), 12.5, 18.5, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 17.5, 19.5, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('shelf_A_big'), 22.5, 18, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 19, 15, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('table_medium_long'), 12, 23, { rot: 90 }), P(fu('table_medium_long'), 12, 14, { rot: 90 }),
      P(fu('table_medium'), 22.5, 15.5, { id: 'orrery_table' }), P(gp('crystal_purple'), 22.5, 15.5, { y: 1.5, scale: 0.6, tint: 0x8a3cff, emissive: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(ip('psx-dungeon', 'chandelier'), 14, 21, { y: 18, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 21, 21, { y: 18, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(fu('rug_oval_B'), 15, 17, { tint: 0x8a1c30 }), P(fu('lamp_standing'), 10.6, 24, { light: lt(0xf2a14a, 1.3, 8, true) }),
      P(dg('banner_patternB_red'), 10.4, 21, { y: 8 }), P(dg('banner_patternB_red'), 25.6, 17, { y: 8 }),
    ],
  }),
  room('meydan', 'Yıldız Meydanı', 26, 23, 20, 16, 'temple', 'temple', 0.15, {
    floorY: L2, ceiling: 10, openAir: true, explicitDecor: true, lightColor: 0x5fd3e8,
    heightAreas: [area('ledge', 37, 23, 8, 2, 8.4, 'rail')],
    slopes: [ST_UST_MEYDAN],
    tiers: [tier('balcony', 9, 26, 23, 7, 2, { depth: 3 })],
    zones: [
      circleZone('rune', 35.5, 31, 6, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.45 }),
      circleZone('rune', 35.5, 31, 4, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.6 }),
      circleZone('rune', 35.5, 31, 2, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.8 }),
      circleZone('pool', 35.5, 31, 3, { color: 0x1a4a58, glow: 0x70e0ff, glowIntensity: 0.6 }),
    ],
    props: [
      P(kn('statue_ring'), 35.5, 31, { scale: 2.6, tint: 0x9aa8d8, light: lt(0x5fd3e8, 1.8, 12, false) }),
      P(kf('fountain-round-detail'), 35.5, 31, { scale: 1.2, tint: 0x9aa8d8 }),
      P(kg('column-large'), 28.5, 29, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 28.5, 35, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 42.5, 29, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 42.5, 35, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(gp('lamp_post'), 27, 25, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 44.5, 25, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(gp('lamp_post'), 27, 38, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 44.5, 38, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(kf('hedge-large'), 27, 27, { tint: 0x2a3a40 }), P(kf('hedge-large'), 27, 32, { tint: 0x2a3a40 }), P(kf('hedge-large'), 27, 37, { tint: 0x2a3a40 }),
      P(gp('crystal_blue'), 27.6, 24, { light: lt(0x5fd3e8, 1.0, 6, false) }),
      P(gp('statue_hooded'), 37.5, 24.4, { tint: 0x6a6a90, id: 'ledge_guard_a' }), P(gp('statue_hooded'), 43.5, 24.4, { tint: 0x6a6a90, id: 'ledge_guard_b' }),
      P(dg('banner_patternC_red'), 43.5, 38.6, { y: 7 }), P(dg('banner_patternC_red'), 28, 38.6, { y: 7 }),
    ],
  }),
  room('buyuk_merdiven', 'Büyük Merdiven', 28, 39, 8, 15, 'temple', 'temple', 0.05, {
    floorY: L0, ceiling: 24, explicitDecor: true, lightColor: 0xf2a14a,
    heightAreas: [area('top_landing', 28, 39, 8, 2, L2, 'rail')],
    slopes: [GRAND_STAIR],
    tiers: [
      tier('colonnade', 8, 28, 39, 8, 15, { count: 8 }), tier('gallery', 8, 28, 39, 8, 15, { depth: 2 }),
      tier('windows', 14, 28, 39, 8, 1, { count: 6, spacing: 1.2 }),
    ],
    props: [
      P(gp('brazier'), 29.2, 43.32, { light: lt(0xf2a14a, 1.6, 9, true) }), P(gp('brazier'), 34.8, 43.32, { light: lt(0xf2a14a, 1.6, 9, true) }),
      P(gp('brazier'), 29.2, 49.75, { light: lt(0xf2a14a, 1.6, 9, true) }), P(gp('brazier'), 34.8, 49.75, { light: lt(0xf2a14a, 1.6, 9, true) }),
      P(ip('psx-dungeon', 'chandelier'), 32, 44.39, { y: 22, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 32, 51.89, { y: 22, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(gp('statue_hooded'), 29.5, 41.18, { tint: 0x6a6a90 }), P(gp('statue_hooded'), 34.5, 41.18, { tint: 0x6a6a90 }),
      P(dg('banner_patternB_red'), 28.3, 45.46, { y: 9 }), P(dg('banner_patternB_red'), 35.7, 45.46, { y: 9 }),
      P(dg('banner_patternB_red'), 28.3, 49.75, { y: 9 }), P(dg('banner_patternB_red'), 35.7, 49.75, { y: 9 }),
      P(hw('arch_gate'), 32, 39.57, { scale: 2.8, tint: 0xb8aed8 }), P(hw('arch_gate'), 32, 53.5, { scale: 2.8, tint: 0xb8aed8 }),
    ],
  }),
  room('gozlemevi', 'Gözlemevi Bahçeleri', 26, 7, 20, 16, 'temple', 'temple', 0.1, {
    floorY: L2, ceiling: 10, openAir: true, boss: 1, explicitDecor: true, fog: fog(0x14183c, 16, 74),
    zones: [circleZone('dais', 35.5, 14.5, 1.6, { color: 0x3a3050 })],
    tiers: [
      tier('balcony', 11, 26, 7, 20, 1, { depth: 3 }), tier('balcony', 11, 26, 22, 20, 1, { depth: 3 }),
      tier('windows', 13, 26, 7, 20, 1, { count: 5, spacing: 3 }),
    ],
    props: [
      P(fu('table_small'), 28, 9, { collide: true, tint: 0xc89040 }), P(fu('table_small'), 43, 9, { collide: true, tint: 0xc89040 }),
      P(gp('crystal_blue'), 28, 20, { collide: false, scale: 1.2, light: lt(0x5fd3e8, 1.2, 8, false) }),
      P(gp('crystal_blue'), 43, 20, { scale: 1.2, light: lt(0x5fd3e8, 1.2, 8, false) }),
      P(gp('crystal_blue'), 26.6, 14.5, { scale: 1.0 }), P(gp('crystal_blue'), 44.4, 14.5, { scale: 1.0 }),
      P(gp('statue_hooded'), 31, 9, { tint: 0x6a6a90 }), P(gp('statue_hooded'), 40, 9, { tint: 0x6a6a90 }),
      P(kg('altar-stone'), 35.5, 14.5, { tint: 0xb8aed8 }),
      P(gp('lamp_post'), 30, 19, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 41, 19, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(kf('hedge-large'), 31, 8, { tint: 0x2a3a40 }), P(kf('hedge-large'), 39, 8, { tint: 0x2a3a40 }),
      P(kn('statue_obelisk'), 43.5, 8.5, { scale: 2.6, tint: 0xb8aed8 }),
    ],
  }),
  room('enerji_avlusu', 'Enerji Avlusu', 46, 6, 22, 12, 'temple', 'temple', 0.2, {
    floorY: L2, ceiling: 10, openAir: true, explicitDecor: true, ambientVfx: 'ambient_dust', fog: fog(0x1a2250, 18, 80),
    slopes: [ST_AVLU_SIG],
    tiers: [tier('balcony', 9, 65, 6, 2, 12, { depth: 3 }), tier('colonnade', 9, 47, 7, 20, 9, { count: 6 })],
    zones: [circleZone('dais', 57, 11.5, 2.0, { color: 0x2a2340 })],
    props: [
      P(gp('crystal_blue'), 48, 8, { id: 'pylon_1', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(gp('crystal_blue'), 64, 7.5, { id: 'pylon_2', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(gp('crystal_blue'), 48, 16, { id: 'pylon_3', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(gp('crystal_blue'), 65, 16, { id: 'pylon_4', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(kg('column-large'), 48.5, 6.5, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 66.5, 6.5, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 51.5, 11, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 62.5, 11, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(gp('lamp_post'), 53, 8, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 61, 15, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(dg('banner_patternB_red'), 47, 9.5, { y: 6 }), P(dg('banner_patternB_red'), 67, 9.5, { y: 6 }),
      P(kf('hedge-large'), 47.5, 16.5, { tint: 0x2a3a40 }), P(kf('hedge-large'), 66.5, 16.5, { tint: 0x2a3a40 }),
    ],
  }),
  room('balkon', 'Güneş Kuyusu Balkonu', 68, 6, 12, 9, 'temple', 'temple', 0.1, {
    floorY: L2, ceiling: 8, openAir: true, optional: true, explicitDecor: true, lightColor: 0xffd77a, fog: fog(0x2a2a50, 10, 60),
    zones: [circleZone('pool', 73.5, 7.75, 2.2, { blocked: true, color: 0xffd77a, glow: 0xffd77a, glowIntensity: 1.4, light: lt(0xffd77a, 1.8, 14, false, 0.8) })],
    props: [
      P(kc('wall-half'), 70, 11.05, { collide: true }), P(kc('wall-half'), 77, 11.05, { collide: true }),
      P(gp('statue_hooded'), 71.8, 12.85, { tint: 0xffd77a, id: 'phoenix_a' }), P(gp('statue_hooded'), 75.8, 12.85, { tint: 0xffd77a, id: 'phoenix_b' }),
      P(gp('chest_gold'), 76, 10, { id: 'balcony_chest' }),
      P(gp('lamp_post'), 69, 13.75, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 78, 13.75, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(gp('crystal_blue'), 70.4, 7.45, { scale: 0.6 }), P(gp('crystal_blue'), 76.6, 7.45, { scale: 0.6 }),
    ],
  }),
  room('siginak', 'Başbüyücü Sığınağı', 48, 18, 18, 14, 'temple', 'temple', 0.1, {
    floorY: L1, ceiling: 18, boss: 2, explicitDecor: true, lightColor: 0x5fd3e8, fog: fog(0x1a1a40, 8, 46),
    tiers: [
      tier('gallery', 9, 48, 18, 18, 14, { depth: 3 }), tier('windows', 12, 48, 18, 18, 1, { count: 6, spacing: 2.5 }),
      tier('beams', 16, 48, 18, 18, 14),
    ],
    zones: [circleZone('rune', 56.5, 24.5, 2.0, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })],
    props: [
      P(gp('crystal_blue'), 56.5, 30.2, { id: 'cynosure', scale: 2.5, tint: 0x8a3cff, emissive: 0x8a3cff, light: lt(0x5fd3e8, 2.0, 12, true) }),
      P(gp('altar'), 50, 27, { tint: 0x5a7aa8 }), P(gp('altar'), 63, 27, { tint: 0x5a7aa8 }),
      P(gp('statue_hooded'), 49.5, 21, { tint: 0x5a7aa8 }), P(gp('statue_hooded'), 63.5, 21, { tint: 0x5a7aa8 }),
      P(kg('column-large'), 49.5, 20, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 63.5, 20, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(gp('brazier'), 49, 30, { light: lt(0xf2a14a, 1.4, 8, true) }), P(gp('brazier'), 64, 30, { light: lt(0xf2a14a, 1.4, 8, true) }),
      P(dg('banner_patternB_red'), 48.4, 22, { y: 7 }), P(dg('banner_patternB_red'), 65.6, 22, { y: 7 }),
      P(ip('psx-dungeon', 'chandelier'), 56.5, 20, { y: 16, light: lt(0x5fd3e8, 1.4, 10, true) }),
    ],
  }),
  room('teras_yolu', 'Teras Yolu', 48, 32, 18, 9, 'temple', 'temple', 0.2, {
    floorY: L1, ceiling: 8, openAir: true, explicitDecor: true, fog: fog(0x1a2250, 18, 80),
    tiers: [tier('windows', 6, 48, 32, 18, 2, { count: 6, spacing: 3 }), tier('gallery', 6, 48, 32, 18, 2, { depth: 2 })],
    props: [
      P(ip('psx-dungeon', 'arch'), 52, 32.25, { scale: 2.5, tint: 0xb8aed8 }), P(ip('psx-dungeon', 'arch'), 57, 32.25, { scale: 2.5, tint: 0xb8aed8 }),
      P(ip('psx-dungeon', 'arch'), 62, 32.25, { scale: 2.5, tint: 0xb8aed8 }),
      P(kg('column-large'), 50.5, 38.55, { id: 'cover_a', scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 53.5, 38.55, { id: 'cover_b', scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 57.5, 38.55, { id: 'cover_c', scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kc('wall-half'), 61, 33.45, { collide: true }), P(kc('wall-half'), 63, 33.45, { collide: true }),
      P(gp('lamp_post'), 51, 32.7, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 59, 32.7, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(gp('lamp_post'), 64, 32.7, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(hw('lantern_hanging'), 55, 33.75, { y: 5 }), P(hw('lantern_hanging'), 61, 33.75, { y: 5 }),
      P(kf('hedge-large'), 49, 39.75, { tint: 0x2a3a40 }), P(kf('hedge-large'), 64, 39.75, { tint: 0x2a3a40 }),
    ],
  }),
  room('takimyildiz', 'Takımyıldız Odası', 48, 41, 18, 14, 'temple', 'temple', 0.1, {
    floorY: L1, ceiling: 30, boss: 3, openAir: true, explicitDecor: true, lightColor: 0x5fd3e8, fog: fog(0x0e1238, 12, 70),
    tiers: [
      tier('gallery', 9, 48, 41, 18, 14, { depth: 3 }), tier('colonnade', 9, 50, 43, 14, 10, { count: 12 }),
      tier('beams', 28, 48, 41, 18, 14),
    ],
    zones: [circleZone('rune', 56.5, 47.5, 5, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.5 })],
    props: [
      P(kn('statue_obelisk'), 56.5, 47.5, { scale: 2.0, tint: 0xd6d0f0, light: lt(0x5fd3e8, 1.6, 12, false) }),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => P(kg('column-large'), 56.5 + 6 * Math.cos((i * Math.PI) / 6), 47.5 + 6 * Math.sin((i * Math.PI) / 6), { scale: 3.5, collide: true, tint: 0xb4a4d6 })),
      P(ip('psx-dungeon', 'chandelier'), 56.5, 41.5, { y: 26, light: lt(0x5fd3e8, 1.1, 8, false) }),
      P(dg('banner_patternB_red'), 48.4, 43, { y: 8 }), P(dg('banner_patternB_red'), 65.6, 51, { y: 8 }),
    ],
  }),
  room('kule_tabani', 'Teori Kulesi Tabanı', 36, 41, 12, 10, 'temple', 'temple', 0.3, {
    floorY: L1, ceiling: 28, explicitDecor: true, lightColor: 0x8a3cff, fog: fog(0x1a1240, 10, 56), ambientVfx: 'ambient_shadow_wisps',
    tiers: [
      tier('gallery', 10, 36, 41, 12, 10, { depth: 2 }), tier('gallery', 18, 36, 41, 12, 10, { depth: 2 }),
      tier('windows', 20, 36, 41, 12, 1, { count: 4, spacing: 2.5 }),
    ],
    zones: [circleZone('void', 41.5, 45.5, 1.6, { blocked: true, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.7 })],
    props: [
      P(gp('crystal_purple'), 37, 48, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(gp('crystal_purple'), 46, 48, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(ip('psx-dungeon', 'chain'), 41.5, 45.5, { y: 22 }), P(ip('psx-dungeon', 'chain'), 40, 42, { y: 22 }),
      P(dg('stairs_walled'), 36.5, 42.5, { rot: 90 }),
      P(ip('psx-dungeon', 'chandelier'), 39, 47, { y: 24, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(ip('psx-dungeon', 'chandelier'), 44, 47, { y: 24, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(kf('hedge-large'), 37, 50, { tint: 0x2a1a40 }),
    ],
  }),
  room('kule_merdiveni', 'Teori Kulesi Merdiveni', 36, 51, 12, 9, 'temple', 'temple', 0.2, {
    floorY: L1, ceiling: 28, explicitDecor: true, lightColor: 0x8a3cff, fog: fog(0x180e3a, 10, 52), ambientVfx: 'ambient_shadow_wisps',
    heightAreas: [area('landing', 36, 57, 12, 3, L3, 'rail')],
    tiers: [tier('gallery', 8, 36, 51, 12, 9, { depth: 1.5 }), tier('beams', 26, 36, 51, 12, 9)],
    props: [
      P(kg('column-large'), 36.8, 52.15, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_a' }),
      P(kg('column-large'), 36.8, 55.15, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_b' }),
      P(kg('column-large'), 46.6, 52.15, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_c' }),
      P(kg('column-large'), 46.6, 55.15, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_d' }),
      P(kg('column-large'), 38.2, 55.45, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_e' }),
      P(kg('column-large'), 43.8, 55.45, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_f' }),
      P(gp('crystal_purple'), 37, 51.85, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(gp('crystal_purple'), 45.4, 51.85, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(gp('crystal_purple'), 41, 51.55, { tint: 0x8a3cff }),
      P(gp('crystal_blue'), 41.5, 56.05, { id: 'lift_pad', scale: 0.6, light: lt(0x5fd3e8, 1.0, 6, false) }),
      P(dg('banner_patternC_red'), 37.2, 58.45, { y: 8 }), P(dg('banner_patternC_red'), 46.1, 58.45, { y: 8 }),
    ],
  }),
  room('hizmet_koridoru', 'Hizmet Koridoru', 26, 62, 6, 2, 'temple', 'temple', 0, {
    floorY: L0, ceiling: 7, explicitDecor: true, lightColor: 0xf2a14a,
    heightAreas: [area('east_end', 30, 62, 2, 2, L3, 'rail')],
    props: [
      P(dg('torch_mounted'), 27, 61.6, { y: 2.5, light: lt(0xf2a14a, 1.8, 9, true) }), P(dg('torch_mounted'), 31, 63.6, { y: 2.5, light: lt(0xf2a14a, 1.8, 9, true) }),
      P(hw('lantern_hanging'), 28.5, 63, { y: 5 }), P(fu('pictureframe_medium'), 29, 61.6, { y: 3 }),
      P(gp('crystal_blue'), 28.5, 62.5, { id: 'service_pad', scale: 0.5, light: lt(0x5fd3e8, 1.0, 6, false) }),
    ],
  }),
  room('goksel_yorunge', 'Göksel Yörünge', 32, 60, 18, 14, 'temple', 'temple', 0.05, {
    floorY: L3, ceiling: 40, openAir: true, boss: 4, explicitDecor: true, ambientVfx: 'ambient_shadow_wisps',
    lightColor: 0x8a3cff, fog: fog(0x0a0820, 20, 90),
    zones: [
      circleZone('void', 40.5, 66.5, 6.8, { blocked: true, ...VOID_RING, vfx: 'ambient_stardust' }),
      circleZone('dais', 40.5, 66.5, 5.2, { color: 0x2a2340 }),
      rectZone('bridge', 41, 60, 2, 2, { color: 0x3a3050 }),
      rectZone('bridge', 32, 64, 4, 2, { color: 0x3a3050 }),
    ],
    props: [
      P(gp('crystal_purple'), 43.6, 63.4, { id: 'lens_ne', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(gp('crystal_purple'), 43.6, 69.6, { id: 'lens_se', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(gp('crystal_purple'), 37.4, 69.6, { id: 'lens_sw', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(gp('crystal_purple'), 37.4, 63.4, { id: 'lens_nw', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(kg('altar-stone'), 40.5, 66.5, { y: 0, scale: 0.8, tint: 0x2a2340 }),
      P(kn('stone_tallB'), 35.5, 62, { scale: 1.2, tint: 0x3a3050 }), P(kn('stone_tallB'), 46.5, 70.5, { scale: 1.2, tint: 0x3a3050 }),
      P(gp('rock_large'), 48.5, 62, { scale: 1.6, tint: 0x3a3050 }),
      P(gp('chest_epic'), 40.5, 71, { id: 'exit_chest' }),
    ],
  }),
];

// ---- doors (19) -----------------------------------------------------------------------------------------------------------------
const DOORS: DoorDef[] = [
  door('giris', 'guney_antre', 16, 62, 'n', 4, 'none'),
  door('guney_antre', 'lycaneum', 17, 50, 'n', 4, 'none'),
  door('lycaneum', 'gizem_arsivi', 17, 41, 'n', 4, 'none'),
  door('gizem_arsivi', 'yasak_raflar', 10, 31, 'w', 2, 'none'),
  { ...door('gizem_arsivi', 'ust_kutuphane', 17, 27, 'n', 4, 'kill_lock'), opensOn: { pack: 'mt_p06', enemyId: 'mt_pyromancer' } },
  door('ust_kutuphane', 'meydan', 25, 23, 'e', 4, 'none'),
  { ...door('guney_antre', 'buyuk_merdiven', 27, 50, 'e', 4, 'kill_lock'), opensOn: { boss: 'boss_arkanotron' } },
  { ...door('buyuk_merdiven', 'meydan', 30, 39, 'n', 4, 'kill_lock'), opensOn: { boss: 'boss_arkanotron' } },
  door('meydan', 'gozlemevi', 30, 23, 'n', 4, 'boss_lock'),
  door('gozlemevi', 'enerji_avlusu', 45, 11, 'e', 4, 'boss_exit'),
  door('enerji_avlusu', 'balkon', 67, 7, 'e', 2, 'none'),
  door('enerji_avlusu', 'siginak', 55, 17, 's', 4, 'boss_lock'),
  door('siginak', 'teras_yolu', 52, 31, 's', 4, 'boss_exit'),
  door('teras_yolu', 'takimyildiz', 52, 40, 's', 4, 'boss_lock'),
  door('takimyildiz', 'kule_tabani', 48, 43, 'w', 4, 'boss_exit'),
  door('kule_tabani', 'kule_merdiveni', 40, 50, 's', 4, 'none'),
  door('kule_merdiveni', 'goksel_yorunge', 40, 59, 's', 4, 'boss_lock'),
  { ...door('giris', 'hizmet_koridoru', 25, 62, 'e', 2, 'kill_lock'), opensOn: { boss: 'boss_gemellus' } },
  door('hizmet_koridoru', 'goksel_yorunge', 31, 62, 'e', 2, 'boss_lock'),
];

// ---- packs (29; forces are the member sums) ---------------------------------------------------------------------------------------
const BIG = new Set(['mt_p01', 'mt_p02', 'mt_p03', 'mt_p07', 'mt_p09', 'mt_p14', 'mt_p15', 'mt_p17', 'mt_p18']);

const PACKS: PackDef[] = [
  packN('mt_p01', 'guney_antre', 17, 57, [['mt_sunblade', 2], ['mt_magister', 2]]),
  packN('mt_p02', 'guney_antre', 23, 55, [['mt_magister', 3], ['mt_sifaci', 1]]),
  packN('mt_p03', 'guney_antre', 18, 53, [['mt_mechanoid', 2], ['mt_sunblade', 2]]),
  packN('mt_p04', 'guney_antre', 19, 56, [['mt_sentry', 1]], { patrol: [[14.5, 59], [25, 59], [25, 51.5], [14.5, 51.5]] }),
  packN('mt_p05', 'lycaneum', 20, 43.5, [['mt_codex', 5]], { dormant: { kind: 'ceiling', wakeRadius: 8 } }),
  packN('mt_p06', 'gizem_arsivi', 16, 32, [['mt_codex', 4], ['mt_pyromancer', 1]]),
  packN('mt_p07', 'gizem_arsivi', 21.5, 36.5, [['mt_voidling', 6], ['mt_voidling_unstable', 2], ['mt_infuser', 2]]),
  packN('mt_p08', 'gizem_arsivi', 12, 29.5, [['mt_spellbreaker', 1], ['mt_magister', 2]]),
  packN('mt_p09', 'gizem_arsivi', 21, 30, [['mt_codex', 6], ['mt_sifaci', 1]]),
  packN('mt_p10', 'yasak_raflar', 5, 31, [['mt_codex', 4], ['mt_pyromancer', 1]], { optional: true }),
  packN('mt_p11', 'ust_kutuphane', 14, 22, [['mt_voidling', 3], ['mt_voidling_unstable', 1], ['mt_voidcaller', 1], ['mt_infuser', 2]]),
  packN('mt_p12', 'ust_kutuphane', 20, 23, [['mt_sunblade', 2], ['mt_sifaci', 2]]),
  packN('mt_p13', 'ust_kutuphane', 15, 16, [['mt_sentry', 1], ['mt_magister', 1]]),
  packN('mt_p14', 'meydan', 32, 32, [['mt_spellbreaker', 1], ['mt_sunblade', 2]]),
  packN('mt_p15', 'meydan', 39, 32, [['mt_spellbreaker', 1], ['mt_magister', 2]]),
  packN('mt_p16', 'meydan', 40.5, 23.5, [['mt_sentry', 1], ['mt_infuser', 2]],
    { dormant: { kind: 'ceiling', wakeRadius: 4 }, linkedTo: ['mt_p13'], wakeWhen: { cleared: ['mt_p14', 'mt_p15'] } }),
  packN('mt_p17', 'enerji_avlusu', 51, 13, [['mt_sunblade', 3], ['mt_sifaci', 1], ['mt_magister', 1]]),
  packN('mt_p18', 'enerji_avlusu', 58, 9, [['mt_mechanoid', 2], ['mt_infuser', 2]]),
  packN('mt_p19', 'enerji_avlusu', 64, 13, [['mt_spellbreaker', 1], ['mt_sifaci', 2]]),
  packN('mt_p20', 'enerji_avlusu', 60.5, 15.5, [['mt_sunblade', 1], ['mt_magister', 1], ['mt_pyromancer', 1]]),
  packN('mt_p21', 'balkon', 77.5, 13, [['mt_sentry', 1], ['mt_mechanoid', 1]], { optional: true }),
  packN('mt_p22', 'teras_yolu', 53, 33.75, [['mt_sunblade', 2], ['mt_voidcaller', 1], ['mt_magister', 1]]),
  packN('mt_p23', 'teras_yolu', 59, 33.75, [['mt_magister', 3], ['mt_sifaci', 2]]),
  packN('mt_p24', 'teras_yolu', 64, 33.75, [['mt_spellbreaker', 1], ['mt_infuser', 2]]),
  packN('mt_p25', 'teras_yolu', 56, 36, [['mt_sentry', 1]], { patrol: [[50, 36], [63.5, 36]] }),
  packN('mt_p26', 'kule_tabani', 39.5, 44, [['mt_tyrant', 1], ['mt_voidling', 4], ['mt_voidling_unstable', 1], ['mt_infuser', 2]]),
  packN('mt_p27', 'kule_tabani', 44.5, 47.5, [['mt_tyrant', 1], ['mt_magister', 2]]),
  packN('mt_p28', 'kule_merdiveni', 39.4, 52.75, [['mt_tyrant', 1], ['mt_voidling', 2], ['mt_voidling_unstable', 1], ['mt_voidcaller', 1], ['mt_infuser', 1]]),
  packN('mt_p29', 'kule_merdiveni', 44, 52.75, [['mt_voidling', 4], ['mt_voidling_unstable', 2], ['mt_infuser', 2]]),
].map((p): PackDef => (BIG.has(p.id) ? { ...p, big: true } : p));

// ---- lifts (players only, mode 'call': the pad holds a player for 0.6 s) ----------------------------------------------------
const LIFTS: LiftDef[] = [
  { id: 'lift_kule', roomId: 'kule_merdiveni', rect: rect(40, 56, 3, 1), stops: [L1, L3], speed: 4.0, mode: 'call', start: 0 },
  { id: 'lift_hizmet', roomId: 'hizmet_koridoru', rect: rect(28, 62, 2, 2), stops: [L0, L3], speed: 4.5, mode: 'call', start: 0 },
];

// ---- bosses (order = boss lock sequence) ------------------------------------------------------------------------------------------
const BOSSES = [
  bossAt('boss_arkanotron', 'gozlemevi', 35.5, 11, 0, 1),
  bossAt('boss_seranel', 'siginak', 56.5, 27.5, 180, 2),
  bossAt('boss_gemellus', 'takimyildiz', 56.5, 44.5, 0, 3),
  bossAt('boss_degentrius', 'goksel_yorunge', 40.5, 66.5, 0, 4),
];

const THEME: DungeonTheme = {
  fogColor: 0x14123a, fogNear: 12, fogFar: 56,
  ambient: 0x4a4478, ambientIntensity: 0.42,
  hemiSky: 0x6a74c8, hemiGround: 0x2a1a38,
  torchColor: 0xf2a14a, bloomStrength: 0.55,
  music: 'dungeon_buyucu_terasi', tint: 0xb8aed8,
  palette: [0x1d1a46, 0x3a2350, 0x6e1b2b, 0xf2a14a, 0x5fd3e8, 0x7c7396, 0xd6d0f0, 0x2a0f3a],
};

export const BUYUCU_TERASI: DungeonDef = {
  id: 'buyucu_terasi',
  name: 'Büyücüler Terası',
  shortName: 'Teras',
  lore: 'Yıldızburnu\'nun en ucunda, Güneş Kuyusu\'nun parıltısını gözetlemek için kurulan Büyücüler Terası, yüzyıllardır Yıldız Büyücüleri\'nin akademisi ve gözlemevi. Terasın kalbinde Alacakaranlık Feneri saklı. Kadim Zindanların mühürleri çatlayınca Boşluk raflardan, mercek yuvalarından ve kürelerin çatlaklarından sızmaya başladı. Büyücülerin yarısı kaçtı, yarısı Boşluk\'a teslim oldu; nöbetçi otomatlar hâlâ kurallara uyuyor. Fener sönmeden Teras\'a çık.',
  levelRange: [60, 60],
  timerSec: 1920,
  forcesRequired: 400,
  theme: THEME,
  grid: { w: 80, h: 74 },
  rooms: ROOMS,
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: [19.5, 67.5], facing: 180 },
  exit: { pos: [40.5, 71] },
  extras: {
    fontOfPower: pt(19.5, 65),
    shrines: [{ type: 'shrine_haste', pos: pt(27, 34) }, { type: 'shrine_ward', pos: pt(37, 48.5) }],
    riftSpots: [pt(22, 56.5), pt(17, 35), pt(36, 34), pt(56, 12), pt(59, 36.75), pt(46, 43)],
    chests: [{ pos: pt(76, 10), kind: 'chest_gold' }, { pos: pt(3.88, 34.5), kind: 'chest_iron' }],
    boons: [
      { id: 'boon_tome', pos: pt(14.2, 42.45), status: 'haste', duration: 1800, magnitude: 0.05, persistOnDeath: true, oncePerPlayer: true },
    ],
  },
  season: 1,
  endgame: true,
  vertical: true,
  lifts: LIFTS,
};

export const BUYUCU_TERASI_ROOM_COUNT = ROOMS.length;
export const BUYUCU_TERASI_TILE = TILE;
