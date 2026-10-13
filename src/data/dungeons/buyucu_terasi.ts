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
const ST_ARSIV_UST: SlopeDef = stairs(rect(11, 24, 2, 2), 'z', L1, L0, { id: 'st_arsiv_ust', style: 'stone' });
const ST_UST_MEYDAN: SlopeDef = stairs(rect(20, 20, 2, 2), 'x', L1, L2, { id: 'st_ust_meydan', style: 'stone' });
const GRAND_STAIR: SlopeDef = stairs(rect(22, 36, 8, 7), 'z', L2, L0, { id: 'grand_stair', style: 'carpet', color: 0x8a1c30 });
const ST_AVLU_SIG: SlopeDef = stairs(rect(49, 14, 2, 4), 'z', L2, L1, { id: 'st_avlu_sig', style: 'stone' });

// ---- chasm: the orrery floats above a void ring (real fall, ENGINE_VERTICALITY ZoneDef.fall) ---------------------------------
const VOID_RING = { fall: 'open', depth: 30, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.9 } as const;

// ---- rooms (18) -----------------------------------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  room('giris', 'Sessiz Fuaye', 8, 58, 12, 8, 'temple', 'temple', 0.3, {
    floorY: L0, ceiling: 14, explicitDecor: true, lightColor: 0xf2a14a,
    tiers: [tier('windows', 6, 8, 59, 1, 6, { count: 3, spacing: 2 }), tier('beams', 13, 8, 58, 12, 8)],
    zones: [circleZone('rune', 13.5, 61, 1.7, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })],
    props: [
      P(gp('font_of_power'), 13.5, 61, { id: 'font_of_power', tag: 'socket', tint: 0xb8f0ff, light: lt(0x5fd3e8, 2.2, 12, false) }),
      P(gp('brazier'), 11.5, 61, { light: lt(0xf2a14a, 1.8, 10, true) }), P(gp('brazier'), 15.5, 61, { light: lt(0xf2a14a, 1.8, 10, true) }),
      P(ip('psx-dungeon', 'chandelier'), 11, 61, { y: 11, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 16, 61, { y: 11 }),
      P(fu('rug_rectangle_stripes_A'), 13.5, 60, { tint: 0x8a1c30 }),
      P(dg('banner_patternB_red'), 8.4, 60, { y: 6 }), P(dg('banner_patternB_red'), 8.4, 64, { y: 6 }),
      P(dg('banner_shield_yellow'), 19.4, 64.5, { y: 6 }),
      P(gp('statue_hooded'), 10, 63.4, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(gp('statue_hooded'), 17, 63.4, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(fu('table_medium'), 17.5, 60, { rot: 90 }), P(fu('book_set'), 17.5, 60),
      P(dg('torch_mounted'), 8.2, 58.8, { y: 2.5 }), P(dg('torch_mounted'), 19.3, 58.8, { y: 2.5 }),
    ],
  }),
  room('guney_antre', 'Güney Antre Salonu', 6, 46, 16, 12, 'temple', 'temple', 0.4, {
    floorY: L0, ceiling: 18, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x1d1a3a, 10, 52),
    tiers: [
      tier('gallery', 6.5, 6, 46, 16, 12, { depth: 3 }), tier('colonnade', 6.5, 7, 47, 14, 10, { count: 8 }),
      tier('windows', 11, 6, 47, 1, 10, { count: 4, spacing: 2.5 }), tier('windows', 11, 21, 47, 1, 10, { count: 4, spacing: 2.5 }),
    ],
    zones: [rectZone('rune', 13, 46.5, 1, 11, { color: 0x4a3a1a, glow: 0xf2a14a, glowIntensity: 0.25 })],
    props: [
      P(kg('column-large'), 7.2, 48, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 7.2, 54, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 20.8, 48, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 20.8, 54, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(ip('psx-dungeon', 'chandelier'), 13.5, 49, { y: 14, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 13.5, 54, { y: 14, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(gp('statue_hooded'), 9.7, 46.7, { tint: 0x6a6a90 }), P(gp('statue_hooded'), 13.3, 46.7, { tint: 0x6a6a90 }),
      P(gp('lamp_post'), 13.5, 48, { light: lt(0xf2a14a, 1.4, 8, true) }), P(gp('lamp_post'), 13.5, 55.5, { light: lt(0xf2a14a, 1.4, 8, true) }),
      P(dg('banner_patternB_red'), 6.3, 49, { y: 6 }), P(dg('banner_patternB_red'), 6.3, 52, { y: 6 }), P(dg('banner_patternB_red'), 21.7, 52, { y: 6 }),
      P(dg('candle_thin'), 9, 56), P(dg('candle_thin'), 18, 47),
    ],
  }),
  room('lycaneum', 'Lycaneum Geçidi', 8, 40, 10, 6, 'temple', 'temple', 0.1, {
    floorY: L0, ceiling: 12, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x2a1a38, 8, 40),
    tiers: [tier('gallery', 5, 8, 40, 10, 1, { depth: 2 })],
    props: [
      P(fu('shelf_A_big'), 12.5, 44, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 16.5, 44, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(gp('statue_hooded'), 8.6, 42.5, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(gp('statue_hooded'), 17.2, 44.5, { tint: 0x6a6a90, emissive: 0x5fd3e8, emissiveIntensity: 0.4 }),
      P(fu('table_small'), 8.2, 40.8, { id: 'tome_lectern' }), P(fu('book_set'), 8.2, 40.8),
      P(fu('lamp_standing'), 9, 45, { light: lt(0xf2a14a, 1.3, 8, true) }), P(fu('lamp_standing'), 17, 41, { light: lt(0xf2a14a, 1.3, 8, true) }),
      P(ip('psx-dungeon', 'chain'), 11, 40.5, { y: 11 }), P(ip('psx-dungeon', 'chain'), 15, 40.5, { y: 11 }),
    ],
  }),
  room('gizem_arsivi', 'Gizem Arşivi', 4, 26, 16, 14, 'temple', 'temple', 0.3, {
    floorY: L0, ceiling: 26, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x2a1a38, 8, 56),
    tiers: [
      tier('gallery', 7.5, 4, 26, 16, 14, { depth: 3 }), tier('gallery', 14, 4, 26, 16, 14, { depth: 2 }),
      tier('colonnade', 7.5, 5, 27, 14, 12, { count: 8 }), tier('windows', 19, 4, 26, 16, 1, { count: 4, spacing: 3.5 }),
      tier('beams', 24, 4, 26, 16, 14),
    ],
    zones: [circleZone('void', 6.5, 28, 0.9, { color: 0x1a0d2a, glow: 0x8a3cff, glowIntensity: 0.5, vfx: 'shadow_ground' })],
    props: [
      P(fu('shelf_A_big'), 5.2, 32, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 5.2, 38, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('shelf_A_big'), 18.8, 32, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 18.8, 38, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('table_medium_long'), 6, 31.5, { rot: 90 }), P(fu('table_medium_long'), 17.5, 31.5, { rot: 90 }),
      P(fu('armchair'), 10, 38.2, { tint: 0x8a1c30, id: 'velvet_throne', rot: 180 }),
      P(ip('psx-dungeon', 'chandelier'), 8, 31, { y: 20, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 16, 31, { y: 20, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(fu('lamp_standing'), 12, 33, { light: lt(0xf2a14a, 1.3, 8, true) }), P(fu('lamp_standing'), 14, 28, { light: lt(0xf2a14a, 1.3, 8, true) }),
      P(fu('chair_A'), 6, 36, { rot: 90 }), P(fu('chair_A'), 17.5, 36, { rot: 270 }),
      P(fu('rug_rectangle_stripes_A'), 11, 38, { tint: 0x8a1c30 }),
      P(hw('lantern_hanging'), 10, 34, { y: 11 }), P(hw('lantern_hanging'), 14, 34, { y: 11 }),
      P(dg('banner_patternC_red'), 4.4, 30, { y: 9 }), P(dg('banner_patternC_red'), 19.6, 30, { y: 9 }),
    ],
  }),
  room('yasak_raflar', 'Yasak Raflar', 0, 28, 4, 10, 'temple', 'temple', 0.3, {
    floorY: L0, ceiling: 20, optional: true, lightColor: 0xf2a14a, fog: fog(0x1a1030, 6, 40),
    tiers: [tier('gallery', 8, 0, 28, 4, 10, { depth: 1.5 })],
    props: [
      P(fu('shelf_A_big'), 1.6, 36.5, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('table_small'), 1.8, 31, { id: 'chained_book' }), P(fu('book_set'), 1.8, 31),
      P(ip('psx-dungeon', 'chain'), 1.5, 30, { y: 16 }), P(ip('psx-dungeon', 'chain'), 2.5, 32, { y: 16 }),
      P(gp('chest_iron'), 1, 34.5), P(hw('lantern_hanging'), 2, 33, { y: 13, light: lt(0xf2a14a, 1.4, 8, true) }),
      P(fu('pictureframe_medium'), 3.6, 29, { y: 3 }),
    ],
  }),
  room('ust_kutuphane', 'Üst Kütüphane', 4, 12, 16, 14, 'wood', 'temple', 0.3, {
    floorY: L1, ceiling: 20, explicitDecor: true, lightColor: 0xf2a14a, fog: fog(0x2a1a38, 8, 50),
    slopes: [ST_ARSIV_UST],
    tiers: [
      tier('gallery', 9.5, 4, 12, 16, 14, { depth: 3 }), tier('windows', 14, 4, 12, 16, 1, { count: 6, spacing: 2.5 }),
      tier('beams', 18, 4, 12, 16, 14),
    ],
    zones: [rectZone('rune', 7.6, 16.4, 1.2, 0.6, { color: 0x1c1024, glow: 0x8a3cff, glowIntensity: 0.6 })],
    props: [
      P(kc('wall-half'), 10.6, 23.5, { collide: true }), P(kc('wall-half'), 13.4, 23.5, { collide: true }),
      P(fu('shelf_A_big'), 6.5, 17.5, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 11.5, 18.5, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('shelf_A_big'), 16.5, 17, { scale: 2.2, collide: true, tint: 0x6a3a3a }), P(fu('shelf_A_big'), 13, 14, { scale: 2.2, collide: true, tint: 0x6a3a3a }),
      P(fu('table_medium_long'), 6, 22, { rot: 90 }), P(fu('table_medium_long'), 6, 13, { rot: 90 }),
      P(fu('table_medium'), 16.5, 14.5, { id: 'orrery_table' }), P(gp('crystal_purple'), 16.5, 14.5, { y: 1.5, scale: 0.6, tint: 0x8a3cff, emissive: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(ip('psx-dungeon', 'chandelier'), 8, 20, { y: 18, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 15, 20, { y: 18, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(fu('rug_oval_B'), 9, 16, { tint: 0x8a1c30 }), P(fu('lamp_standing'), 4.6, 23, { light: lt(0xf2a14a, 1.3, 8, true) }),
      P(dg('banner_patternB_red'), 4.4, 20, { y: 8 }), P(dg('banner_patternB_red'), 19.6, 16, { y: 8 }),
    ],
  }),
  room('meydan', 'Yıldız Meydanı', 20, 18, 20, 16, 'temple', 'temple', 0.15, {
    floorY: L2, ceiling: 10, openAir: true, explicitDecor: true, lightColor: 0x5fd3e8,
    heightAreas: [area('ledge', 31, 18, 8, 2, 8.4, 'rail')],
    slopes: [ST_UST_MEYDAN],
    tiers: [tier('balcony', 9, 20, 18, 7, 2, { depth: 3 })],
    zones: [
      circleZone('rune', 29.5, 26, 6, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.45 }),
      circleZone('rune', 29.5, 26, 4, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.6 }),
      circleZone('rune', 29.5, 26, 2, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.8 }),
      circleZone('pool', 29.5, 26, 3, { color: 0x1a4a58, glow: 0x70e0ff, glowIntensity: 0.6 }),
    ],
    props: [
      P(kn('statue_ring'), 29.5, 26, { scale: 2.6, tint: 0x9aa8d8, light: lt(0x5fd3e8, 1.8, 12, false) }),
      P(kf('fountain-round-detail'), 29.5, 26, { scale: 1.2, tint: 0x9aa8d8 }),
      P(kg('column-large'), 22.5, 24, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 22.5, 30, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 36.5, 24, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 36.5, 30, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(gp('lamp_post'), 21, 20, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 38.5, 20, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(gp('lamp_post'), 21, 33, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 38.5, 33, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(kf('hedge-large'), 21, 22, { tint: 0x2a3a40 }), P(kf('hedge-large'), 21, 27, { tint: 0x2a3a40 }), P(kf('hedge-large'), 21, 32, { tint: 0x2a3a40 }),
      P(gp('crystal_blue'), 21.6, 19, { light: lt(0x5fd3e8, 1.0, 6, false) }),
      P(gp('statue_hooded'), 31.5, 19.4, { tint: 0x6a6a90, id: 'ledge_guard_a' }), P(gp('statue_hooded'), 37.5, 19.4, { tint: 0x6a6a90, id: 'ledge_guard_b' }),
      P(dg('banner_patternC_red'), 37.5, 33.6, { y: 7 }), P(dg('banner_patternC_red'), 22, 33.6, { y: 7 }),
    ],
  }),
  room('buyuk_merdiven', 'Büyük Merdiven', 22, 34, 8, 14, 'temple', 'temple', 0.05, {
    floorY: L0, ceiling: 24, explicitDecor: true, lightColor: 0xf2a14a,
    heightAreas: [area('top_landing', 22, 34, 8, 2, L2, 'rail')],
    slopes: [GRAND_STAIR],
    tiers: [
      tier('colonnade', 8, 22, 34, 8, 14, { count: 8 }), tier('gallery', 8, 22, 34, 8, 14, { depth: 2 }),
      tier('windows', 14, 22, 34, 8, 1, { count: 6, spacing: 1.2 }),
    ],
    props: [
      P(gp('brazier'), 23.2, 38, { light: lt(0xf2a14a, 1.6, 9, true) }), P(gp('brazier'), 28.8, 38, { light: lt(0xf2a14a, 1.6, 9, true) }),
      P(gp('brazier'), 23.2, 44, { light: lt(0xf2a14a, 1.6, 9, true) }), P(gp('brazier'), 28.8, 44, { light: lt(0xf2a14a, 1.6, 9, true) }),
      P(ip('psx-dungeon', 'chandelier'), 26, 39, { y: 22, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(ip('psx-dungeon', 'chandelier'), 26, 46, { y: 22, light: lt(0xf2a14a, 1.8, 11, true) }),
      P(gp('statue_hooded'), 23.5, 36, { tint: 0x6a6a90 }), P(gp('statue_hooded'), 28.5, 36, { tint: 0x6a6a90 }),
      P(dg('banner_patternB_red'), 22.3, 40, { y: 9 }), P(dg('banner_patternB_red'), 29.7, 40, { y: 9 }),
      P(dg('banner_patternB_red'), 22.3, 44, { y: 9 }), P(dg('banner_patternB_red'), 29.7, 44, { y: 9 }),
      P(hw('arch_gate'), 26, 34.5, { scale: 2.8, tint: 0xb8aed8 }), P(hw('arch_gate'), 26, 47.5, { scale: 2.8, tint: 0xb8aed8 }),
    ],
  }),
  room('gozlemevi', 'Gözlemevi Bahçeleri', 20, 2, 20, 16, 'temple', 'temple', 0.1, {
    floorY: L2, ceiling: 10, openAir: true, boss: 1, explicitDecor: true, fog: fog(0x14183c, 16, 74),
    zones: [circleZone('dais', 29.5, 9.5, 1.6, { color: 0x3a3050 })],
    tiers: [
      tier('balcony', 11, 20, 2, 20, 1, { depth: 3 }), tier('balcony', 11, 20, 17, 20, 1, { depth: 3 }),
      tier('windows', 13, 20, 2, 20, 1, { count: 5, spacing: 3 }),
    ],
    props: [
      P(fu('table_small'), 22, 4, { collide: true, tint: 0xc89040 }), P(fu('table_small'), 37, 4, { collide: true, tint: 0xc89040 }),
      P(gp('crystal_blue'), 22, 15, { collide: false, scale: 1.2, light: lt(0x5fd3e8, 1.2, 8, false) }),
      P(gp('crystal_blue'), 37, 15, { scale: 1.2, light: lt(0x5fd3e8, 1.2, 8, false) }),
      P(gp('crystal_blue'), 20.6, 9.5, { scale: 1.0 }), P(gp('crystal_blue'), 38.4, 9.5, { scale: 1.0 }),
      P(gp('statue_hooded'), 25, 4, { tint: 0x6a6a90 }), P(gp('statue_hooded'), 34, 4, { tint: 0x6a6a90 }),
      P(kg('altar-stone'), 29.5, 9.5, { tint: 0xb8aed8 }),
      P(gp('lamp_post'), 24, 14, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 35, 14, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(kf('hedge-large'), 25, 3, { tint: 0x2a3a40 }), P(kf('hedge-large'), 33, 3, { tint: 0x2a3a40 }),
      P(kn('statue_obelisk'), 37.5, 3.5, { scale: 2.6, tint: 0xb8aed8 }),
    ],
  }),
  room('enerji_avlusu', 'Enerji Avlusu', 40, 6, 22, 12, 'temple', 'temple', 0.2, {
    floorY: L2, ceiling: 10, openAir: true, explicitDecor: true, ambientVfx: 'ambient_dust', fog: fog(0x1a2250, 18, 80),
    slopes: [ST_AVLU_SIG],
    tiers: [tier('balcony', 9, 59, 6, 2, 12, { depth: 3 }), tier('colonnade', 9, 41, 7, 20, 9, { count: 6 })],
    zones: [circleZone('dais', 51, 11.5, 2.0, { color: 0x2a2340 })],
    props: [
      P(gp('crystal_blue'), 42, 8, { id: 'pylon_1', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(gp('crystal_blue'), 58, 7.5, { id: 'pylon_2', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(gp('crystal_blue'), 42, 16, { id: 'pylon_3', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(gp('crystal_blue'), 59, 16, { id: 'pylon_4', scale: 1.5, tint: 0xb8ffe0, light: lt(0x5fd3e8, 1.3, 7, false) }),
      P(kg('column-large'), 42.5, 6.5, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 60.5, 6.5, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 45.5, 11, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 56.5, 11, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(gp('lamp_post'), 47, 8, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 55, 15, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(dg('banner_patternB_red'), 41, 9.5, { y: 6 }), P(dg('banner_patternB_red'), 61, 9.5, { y: 6 }),
      P(kf('hedge-large'), 41.5, 16.5, { tint: 0x2a3a40 }), P(kf('hedge-large'), 60.5, 16.5, { tint: 0x2a3a40 }),
    ],
  }),
  room('balkon', 'Güneş Kuyusu Balkonu', 48, 0, 12, 6, 'temple', 'temple', 0.1, {
    floorY: L2, ceiling: 8, openAir: true, optional: true, explicitDecor: true, lightColor: 0xffd77a, fog: fog(0x2a2a50, 10, 60),
    zones: [circleZone('pool', 53.5, 1.0, 2.2, { blocked: true, color: 0xffd77a, glow: 0xffd77a, glowIntensity: 1.4, light: lt(0xffd77a, 1.8, 14, false, 0.8) })],
    props: [
      P(kc('wall-half'), 50.0, 3.2, { collide: true }), P(kc('wall-half'), 57.0, 3.2, { collide: true }),
      P(gp('statue_hooded'), 51.8, 4.4, { tint: 0xffd77a, id: 'phoenix_a' }), P(gp('statue_hooded'), 55.8, 4.4, { tint: 0xffd77a, id: 'phoenix_b' }),
      P(gp('chest_gold'), 56, 2.5, { id: 'balcony_chest' }),
      P(gp('lamp_post'), 49, 5, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 58, 5, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(gp('crystal_blue'), 50.4, 0.8, { scale: 0.6 }), P(gp('crystal_blue'), 56.6, 0.8, { scale: 0.6 }),
    ],
  }),
  room('siginak', 'Başbüyücü Sığınağı', 42, 18, 18, 14, 'temple', 'temple', 0.1, {
    floorY: L1, ceiling: 18, boss: 2, explicitDecor: true, lightColor: 0x5fd3e8, fog: fog(0x1a1a40, 8, 46),
    tiers: [
      tier('gallery', 9, 42, 18, 18, 14, { depth: 3 }), tier('windows', 12, 42, 18, 18, 1, { count: 6, spacing: 2.5 }),
      tier('beams', 16, 42, 18, 18, 14),
    ],
    zones: [circleZone('rune', 50.5, 24.5, 2.0, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.9 })],
    props: [
      P(gp('crystal_blue'), 50.5, 30.2, { id: 'cynosure', scale: 2.5, tint: 0x8a3cff, emissive: 0x8a3cff, light: lt(0x5fd3e8, 2.0, 12, true) }),
      P(gp('altar'), 44, 27, { tint: 0x5a7aa8 }), P(gp('altar'), 57, 27, { tint: 0x5a7aa8 }),
      P(gp('statue_hooded'), 43.5, 21, { tint: 0x5a7aa8 }), P(gp('statue_hooded'), 57.5, 21, { tint: 0x5a7aa8 }),
      P(kg('column-large'), 43.5, 20, { scale: 3, collide: true, tint: 0xb4a4d6 }), P(kg('column-large'), 57.5, 20, { scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(gp('brazier'), 43, 30, { light: lt(0xf2a14a, 1.4, 8, true) }), P(gp('brazier'), 58, 30, { light: lt(0xf2a14a, 1.4, 8, true) }),
      P(dg('banner_patternB_red'), 42.4, 22, { y: 7 }), P(dg('banner_patternB_red'), 59.6, 22, { y: 7 }),
      P(ip('psx-dungeon', 'chandelier'), 50.5, 20, { y: 16, light: lt(0x5fd3e8, 1.4, 10, true) }),
    ],
  }),
  room('teras_yolu', 'Teras Yolu', 42, 32, 18, 6, 'temple', 'temple', 0.2, {
    floorY: L1, ceiling: 8, openAir: true, explicitDecor: true, fog: fog(0x1a2250, 18, 80),
    tiers: [tier('windows', 6, 42, 32, 18, 1, { count: 6, spacing: 3 }), tier('gallery', 6, 42, 32, 18, 1, { depth: 2 })],
    props: [
      P(ip('psx-dungeon', 'arch'), 46, 32, { scale: 2.5, tint: 0xb8aed8 }), P(ip('psx-dungeon', 'arch'), 51, 32, { scale: 2.5, tint: 0xb8aed8 }),
      P(ip('psx-dungeon', 'arch'), 56, 32, { scale: 2.5, tint: 0xb8aed8 }),
      P(kg('column-large'), 44.5, 36.2, { id: 'cover_a', scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 47.5, 36.2, { id: 'cover_b', scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kg('column-large'), 51.5, 36.2, { id: 'cover_c', scale: 3, collide: true, tint: 0xb4a4d6 }),
      P(kc('wall-half'), 55, 32.8, { collide: true }), P(kc('wall-half'), 57, 32.8, { collide: true }),
      P(gp('lamp_post'), 45, 32.3, { light: lt(0xf2a14a, 1.4, 9, true) }), P(gp('lamp_post'), 53, 32.3, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(gp('lamp_post'), 58, 32.3, { light: lt(0xf2a14a, 1.4, 9, true) }),
      P(hw('lantern_hanging'), 49, 33, { y: 5 }), P(hw('lantern_hanging'), 55, 33, { y: 5 }),
      P(kf('hedge-large'), 43, 37, { tint: 0x2a3a40 }), P(kf('hedge-large'), 58, 37, { tint: 0x2a3a40 }),
    ],
  }),
  room('takimyildiz', 'Takımyıldız Odası', 42, 38, 18, 14, 'temple', 'temple', 0.1, {
    floorY: L1, ceiling: 30, boss: 3, openAir: true, explicitDecor: true, lightColor: 0x5fd3e8, fog: fog(0x0e1238, 12, 70),
    tiers: [
      tier('gallery', 9, 42, 38, 18, 14, { depth: 3 }), tier('colonnade', 9, 44, 40, 14, 10, { count: 12 }),
      tier('beams', 28, 42, 38, 18, 14),
    ],
    zones: [circleZone('rune', 50.5, 44.5, 5, { color: 0x101c30, glow: 0x5fd3e8, glowIntensity: 0.5 })],
    props: [
      P(kn('statue_obelisk'), 50.5, 44.5, { scale: 2.0, tint: 0xd6d0f0, light: lt(0x5fd3e8, 1.6, 12, false) }),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => P(kg('column-large'), 50.5 + 6 * Math.cos((i * Math.PI) / 6), 44.5 + 6 * Math.sin((i * Math.PI) / 6), { scale: 3.5, collide: true, tint: 0xb4a4d6 })),
      P(ip('psx-dungeon', 'chandelier'), 50.5, 38.5, { y: 26, light: lt(0x5fd3e8, 1.1, 8, false) }),
      P(dg('banner_patternB_red'), 42.4, 40, { y: 8 }), P(dg('banner_patternB_red'), 59.6, 48, { y: 8 }),
    ],
  }),
  room('kule_tabani', 'Teori Kulesi Tabanı', 30, 40, 12, 10, 'temple', 'temple', 0.3, {
    floorY: L1, ceiling: 28, explicitDecor: true, lightColor: 0x8a3cff, fog: fog(0x1a1240, 10, 56), ambientVfx: 'ambient_shadow_wisps',
    tiers: [
      tier('gallery', 10, 30, 40, 12, 10, { depth: 2 }), tier('gallery', 18, 30, 40, 12, 10, { depth: 2 }),
      tier('windows', 20, 30, 40, 12, 1, { count: 4, spacing: 2.5 }),
    ],
    zones: [circleZone('void', 35.5, 44.5, 1.6, { blocked: true, color: 0x05031a, glow: 0x8a3cff, glowIntensity: 0.7 })],
    props: [
      P(gp('crystal_purple'), 31, 47, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(gp('crystal_purple'), 40, 47, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(ip('psx-dungeon', 'chain'), 35.5, 44.5, { y: 22 }), P(ip('psx-dungeon', 'chain'), 34, 41, { y: 22 }),
      P(dg('stairs_walled'), 30.5, 41.5, { rot: 90 }),
      P(ip('psx-dungeon', 'chandelier'), 33, 46, { y: 24, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(ip('psx-dungeon', 'chandelier'), 38, 46, { y: 24, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(kf('hedge-large'), 31, 49, { tint: 0x2a1a40 }),
    ],
  }),
  room('kule_merdiveni', 'Teori Kulesi Merdiveni', 30, 50, 12, 6, 'temple', 'temple', 0.2, {
    floorY: L1, ceiling: 28, explicitDecor: true, lightColor: 0x8a3cff, fog: fog(0x180e3a, 10, 52), ambientVfx: 'ambient_shadow_wisps',
    heightAreas: [area('landing', 30, 54, 12, 2, L3, 'rail')],
    tiers: [tier('gallery', 8, 30, 50, 12, 6, { depth: 1.5 }), tier('beams', 26, 30, 50, 12, 6)],
    props: [
      P(kg('column-large'), 30.8, 50.6, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_a' }),
      P(kg('column-large'), 30.8, 52.6, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_b' }),
      P(kg('column-large'), 40.6, 50.6, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_c' }),
      P(kg('column-large'), 40.6, 52.6, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_d' }),
      P(kg('column-large'), 32.2, 52.8, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_e' }),
      P(kg('column-large'), 37.8, 52.8, { scale: 3, collide: true, tint: 0xb4a4d6, id: 'tower_col_f' }),
      P(gp('crystal_purple'), 31, 50.4, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(gp('crystal_purple'), 39.4, 50.4, { tint: 0x8a3cff, light: lt(0x8a3cff, 1.4, 8, true) }),
      P(gp('crystal_purple'), 35, 50.2, { tint: 0x8a3cff }),
      P(gp('crystal_blue'), 35.5, 53.2, { id: 'lift_pad', scale: 0.6, light: lt(0x5fd3e8, 1.0, 6, false) }),
      P(dg('banner_patternC_red'), 31.2, 54.8, { y: 8 }), P(dg('banner_patternC_red'), 40.1, 54.8, { y: 8 }),
    ],
  }),
  room('hizmet_koridoru', 'Hizmet Koridoru', 20, 60, 6, 2, 'temple', 'temple', 0, {
    floorY: L0, ceiling: 7, explicitDecor: true, lightColor: 0xf2a14a,
    heightAreas: [area('east_end', 24, 60, 2, 2, L3, 'rail')],
    props: [
      P(dg('torch_mounted'), 21, 59.6, { y: 2.5, light: lt(0xf2a14a, 1.8, 9, true) }), P(dg('torch_mounted'), 25, 61.6, { y: 2.5, light: lt(0xf2a14a, 1.8, 9, true) }),
      P(hw('lantern_hanging'), 22.5, 61, { y: 5 }), P(fu('pictureframe_medium'), 23, 59.6, { y: 3 }),
      P(gp('crystal_blue'), 22.5, 60.5, { id: 'service_pad', scale: 0.5, light: lt(0x5fd3e8, 1.0, 6, false) }),
    ],
  }),
  room('goksel_yorunge', 'Göksel Yörünge', 26, 56, 18, 14, 'temple', 'temple', 0.05, {
    floorY: L3, ceiling: 40, openAir: true, boss: 4, explicitDecor: true, ambientVfx: 'ambient_shadow_wisps',
    lightColor: 0x8a3cff, fog: fog(0x0a0820, 20, 90),
    zones: [
      circleZone('void', 34.5, 62.5, 6.8, { blocked: true, ...VOID_RING, vfx: 'ambient_stardust' }),
      circleZone('dais', 34.5, 62.5, 5.2, { color: 0x2a2340 }),
      rectZone('bridge', 35, 56, 2, 2, { color: 0x3a3050 }),
      rectZone('bridge', 26, 60, 4, 2, { color: 0x3a3050 }),
    ],
    props: [
      P(gp('crystal_purple'), 37.6, 59.4, { id: 'lens_ne', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(gp('crystal_purple'), 37.6, 65.6, { id: 'lens_se', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(gp('crystal_purple'), 31.4, 65.6, { id: 'lens_sw', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(gp('crystal_purple'), 31.4, 59.4, { id: 'lens_nw', scale: 2.0, tint: 0x5fd3e8, emissive: 0x5fd3e8, light: lt(0x5fd3e8, 1.4, 9, false, 2) }),
      P(kg('altar-stone'), 34.5, 62.5, { y: 0, scale: 0.8, tint: 0x2a2340 }),
      P(kn('stone_tallB'), 29.5, 58, { scale: 1.2, tint: 0x3a3050 }), P(kn('stone_tallB'), 40.5, 66.5, { scale: 1.2, tint: 0x3a3050 }),
      P(gp('rock_large'), 42.5, 58, { scale: 1.6, tint: 0x3a3050 }),
      P(gp('chest_epic'), 34.5, 67.0, { id: 'exit_chest' }),
    ],
  }),
];

// ---- doors (19) -----------------------------------------------------------------------------------------------------------------
const DOORS: DoorDef[] = [
  door('giris', 'guney_antre', 13, 58, 'n', 2, 'none'),
  door('guney_antre', 'lycaneum', 11, 46, 'n', 2, 'none'),
  door('lycaneum', 'gizem_arsivi', 11, 40, 'n', 2, 'none'),
  door('gizem_arsivi', 'yasak_raflar', 4, 32, 'w', 2, 'none'),
  { ...door('gizem_arsivi', 'ust_kutuphane', 11, 26, 'n', 2, 'kill_lock'), opensOn: { pack: 'mt_p06', enemyId: 'mt_pyromancer' } },
  door('ust_kutuphane', 'meydan', 19, 20, 'e', 2, 'none'),
  { ...door('guney_antre', 'buyuk_merdiven', 21, 46, 'e', 2, 'kill_lock'), opensOn: { boss: 'boss_arkanotron' } },
  { ...door('buyuk_merdiven', 'meydan', 24, 34, 'n', 2, 'kill_lock'), opensOn: { boss: 'boss_arkanotron' } },
  door('meydan', 'gozlemevi', 28, 18, 'n', 2, 'boss_lock'),
  door('gozlemevi', 'enerji_avlusu', 39, 10, 'e', 2, 'boss_exit'),
  door('enerji_avlusu', 'balkon', 53, 6, 'n', 2, 'none'),
  door('enerji_avlusu', 'siginak', 49, 17, 's', 2, 'boss_lock'),
  door('siginak', 'teras_yolu', 49, 31, 's', 2, 'boss_exit'),
  door('teras_yolu', 'takimyildiz', 49, 37, 's', 2, 'boss_lock'),
  door('takimyildiz', 'kule_tabani', 42, 44, 'w', 2, 'boss_exit'),
  door('kule_tabani', 'kule_merdiveni', 35, 49, 's', 2, 'none'),
  door('kule_merdiveni', 'goksel_yorunge', 35, 55, 's', 2, 'boss_lock'),
  { ...door('giris', 'hizmet_koridoru', 19, 60, 'e', 2, 'kill_lock'), opensOn: { boss: 'boss_gemellus' } },
  door('hizmet_koridoru', 'goksel_yorunge', 25, 60, 'e', 2, 'boss_lock'),
];

// ---- packs (29; forces are the member sums) ---------------------------------------------------------------------------------------
const BIG = new Set(['mt_p01', 'mt_p02', 'mt_p03', 'mt_p07', 'mt_p09', 'mt_p14', 'mt_p15', 'mt_p17', 'mt_p18']);

const PACKS: PackDef[] = [
  packN('mt_p01', 'guney_antre', 11, 53, [['mt_sunblade', 2], ['mt_magister', 2]]),
  packN('mt_p02', 'guney_antre', 17, 51, [['mt_magister', 3], ['mt_sifaci', 1]]),
  packN('mt_p03', 'guney_antre', 12, 49, [['mt_mechanoid', 2], ['mt_sunblade', 2]]),
  packN('mt_p04', 'guney_antre', 13, 52, [['mt_sentry', 1]], { patrol: [[8.5, 55], [19, 55], [19, 47.5], [8.5, 47.5]] }),
  packN('mt_p05', 'lycaneum', 14, 41.5, [['mt_codex', 5]], { dormant: { kind: 'ceiling', wakeRadius: 8 } }),
  packN('mt_p06', 'gizem_arsivi', 10, 31, [['mt_codex', 4], ['mt_pyromancer', 1]]),
  packN('mt_p07', 'gizem_arsivi', 15.5, 35.5, [['mt_voidling', 6], ['mt_voidling_unstable', 2], ['mt_infuser', 2]]),
  packN('mt_p08', 'gizem_arsivi', 6, 28.5, [['mt_spellbreaker', 1], ['mt_magister', 2]]),
  packN('mt_p09', 'gizem_arsivi', 15, 29, [['mt_codex', 6], ['mt_sifaci', 1]]),
  packN('mt_p10', 'yasak_raflar', 1.5, 31, [['mt_codex', 4], ['mt_pyromancer', 1]], { optional: true }),
  packN('mt_p11', 'ust_kutuphane', 8, 21, [['mt_voidling', 3], ['mt_voidling_unstable', 1], ['mt_voidcaller', 1], ['mt_infuser', 2]]),
  packN('mt_p12', 'ust_kutuphane', 14, 22, [['mt_sunblade', 2], ['mt_sifaci', 2]]),
  packN('mt_p13', 'ust_kutuphane', 9, 15, [['mt_sentry', 1], ['mt_magister', 1]]),
  packN('mt_p14', 'meydan', 26, 27, [['mt_spellbreaker', 1], ['mt_sunblade', 2]]),
  packN('mt_p15', 'meydan', 33, 27, [['mt_spellbreaker', 1], ['mt_magister', 2]]),
  packN('mt_p16', 'meydan', 34.5, 18.5, [['mt_sentry', 1], ['mt_infuser', 2]],
    { dormant: { kind: 'ceiling', wakeRadius: 4 }, linkedTo: ['mt_p13'], wakeWhen: { cleared: ['mt_p14', 'mt_p15'] } }),
  packN('mt_p17', 'enerji_avlusu', 45, 13, [['mt_sunblade', 3], ['mt_sifaci', 1], ['mt_magister', 1]]),
  packN('mt_p18', 'enerji_avlusu', 52, 9, [['mt_mechanoid', 2], ['mt_infuser', 2]]),
  packN('mt_p19', 'enerji_avlusu', 58, 13, [['mt_spellbreaker', 1], ['mt_sifaci', 2]]),
  packN('mt_p20', 'enerji_avlusu', 54.5, 15.5, [['mt_sunblade', 1], ['mt_magister', 1], ['mt_pyromancer', 1]]),
  packN('mt_p21', 'balkon', 57.5, 4.5, [['mt_sentry', 1], ['mt_mechanoid', 1]], { optional: true }),
  packN('mt_p22', 'teras_yolu', 47, 33, [['mt_sunblade', 2], ['mt_voidcaller', 1], ['mt_magister', 1]]),
  packN('mt_p23', 'teras_yolu', 53, 33, [['mt_magister', 3], ['mt_sifaci', 2]]),
  packN('mt_p24', 'teras_yolu', 58, 33, [['mt_spellbreaker', 1], ['mt_infuser', 2]]),
  packN('mt_p25', 'teras_yolu', 50, 34.5, [['mt_sentry', 1]], { patrol: [[44, 34.5], [57.5, 34.5]] }),
  packN('mt_p26', 'kule_tabani', 33.5, 43, [['mt_tyrant', 1], ['mt_voidling', 4], ['mt_voidling_unstable', 1], ['mt_infuser', 2]]),
  packN('mt_p27', 'kule_tabani', 38.5, 46.5, [['mt_tyrant', 1], ['mt_magister', 2]]),
  packN('mt_p28', 'kule_merdiveni', 33.4, 51.0, [['mt_tyrant', 1], ['mt_voidling', 2], ['mt_voidling_unstable', 1], ['mt_voidcaller', 1], ['mt_infuser', 1]]),
  packN('mt_p29', 'kule_merdiveni', 38.0, 51.0, [['mt_voidling', 4], ['mt_voidling_unstable', 2], ['mt_infuser', 2]]),
].map((p): PackDef => (BIG.has(p.id) ? { ...p, big: true } : p));

// ---- lifts (players only, mode 'call': the pad holds a player for 0.6 s) ----------------------------------------------------
const LIFTS: LiftDef[] = [
  { id: 'lift_kule', roomId: 'kule_merdiveni', rect: rect(34, 53, 3, 1), stops: [L1, L3], speed: 4.0, mode: 'call', start: 0 },
  { id: 'lift_hizmet', roomId: 'hizmet_koridoru', rect: rect(22, 60, 2, 2), stops: [L0, L3], speed: 4.5, mode: 'call', start: 0 },
];

// ---- bosses (order = boss lock sequence) ------------------------------------------------------------------------------------------
const BOSSES = [
  bossAt('boss_arkanotron', 'gozlemevi', 29.5, 6.0, 0, 1),
  bossAt('boss_seranel', 'siginak', 50.5, 27.5, 180, 2),
  bossAt('boss_gemellus', 'takimyildiz', 50.5, 41.5, 0, 3),
  bossAt('boss_degentrius', 'goksel_yorunge', 34.5, 62.5, 0, 4),
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
  timerSec: 1860,
  forcesRequired: 400,
  theme: THEME,
  grid: { w: 64, h: 70 },
  rooms: ROOMS,
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: [13.5, 63.5], facing: 180 },
  exit: { pos: [34.5, 67.0] },
  extras: {
    fontOfPower: pt(13.5, 61),
    shrines: [{ type: 'shrine_haste', pos: pt(21, 29) }, { type: 'shrine_ward', pos: pt(31, 47.5) }],
    riftSpots: [pt(16, 52.5), pt(11, 34), pt(30, 29), pt(50, 12), pt(53, 35), pt(40, 42)],
    chests: [{ pos: pt(56, 2.5), kind: 'chest_gold' }, { pos: pt(1, 34.5), kind: 'chest_iron' }],
    boons: [
      { id: 'boon_tome', pos: pt(8.2, 40.8), status: 'haste', duration: 1800, magnitude: 0.05, persistOnDeath: true, oncePerPlayer: true },
    ],
  },
  season: 1,
  endgame: true,
  vertical: true,
  lifts: LIFTS,
};

export const BUYUCU_TERASI_ROOM_COUNT = ROOMS.length;
export const BUYUCU_TERASI_TILE = TILE;
