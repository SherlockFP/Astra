import type { DecorTier, DoorDef, DungeonDef, DungeonTheme, HeightArea, PackDef, PropPlacement, RoomDef, SlopeDef, TileRect, ZoneDef } from '../../types/dungeons';
import '../enemies_peri_sisleri';
import type { PO, PackExtra } from './kit';
import { bossAt, chandelier, circleZone, dg, door, gp, hw, kn, lt, pack, pt, rectZone, room, stairs, ramp } from './kit';

/**
 * PERI SISLERI (peri_sisleri), Season 1 Mythic+ dungeon. Design: docs/dungeons/peri_sisleri.md (sections 3, 4.6, 6, 7 of the
 * rooms, doors and packs, 2.11 for the dressing). Heights follow docs/ENGINE_VERTICALITY.md (vertical: true, seven walkable
 * floor levels from -2.4 m to +7.2 m, three stair flights and one ramp, a chasm with a bridge).
 *
 * NOT YET REGISTERED: this file is not in dungeons/index.ts. Registration lines are listed in the report.
 * Known gaps against the design (PS-D9 and the Blender packages are not built): the Kök Kapısı channel gates (doors 6 and 25
 * are open doors for now), the maze sigil puzzle (choice doorways are open, no traps), the nest seed beyond the
 * checkpoint list, the sky panorama, the 1,350-prop dressing pass (only the set pieces below are placed), the
 * Peri Sisleri entrance, and the new GLB props (peri_*), which fall back to existing models here.
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

/** Design spiral of section 4.6 (tile offsets from the pack centre; melee first, casters last). Keeps members off walls. */
const SPIRAL: [number, number][] = [
  [0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53],
  [-0.28, 1.03], [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.58, -1.23], [0.43, 1.36],
];
/** Pack of `counts` [enemyId, n] pairs laid on the spiral (replaces the kit's rank layout, which pushes members north). */
function packN(id: string, roomId: string, cx: number, cz: number, counts: [string, number][], extra: PackExtra = {}) {
  const ids = counts.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  if (ids.length > SPIRAL.length) throw new Error(`[peri_sisleri] pack ${id}: ${ids.length} members, spiral holds ${SPIRAL.length}`);
  return pack(id, roomId, cx, cz, undefined, ids.map((enemyId, i) => [enemyId, SPIRAL[i][0], SPIRAL[i][1]] as [string, number, number]), extra);
}

// ---- slopes (stairs and the ramp): axis is the direction of the run; yFrom at the min edge, yTo at the max edge -----------
const ST_PATCH: SlopeDef = stairs(rect(11, 53, 4, 2), 'x', 0.0, 1.2, { id: 'st_patika' });
const ST_RITUAL: SlopeDef = stairs(rect(21, 44, 2, 2), 'z', 2.4, 1.2, { id: 'st_ritual' });
const ST_KOK: SlopeDef = stairs(rect(16, 24, 12, 3), 'z', 4.8, 2.4, { id: 'st_kok' });
const ST_SELALE: SlopeDef = stairs(rect(61, 19, 3, 5), 'z', 6.4, 1.2, { id: 'st_selale' });
const ST_KUYU: SlopeDef = stairs(rect(56, 39, 9, 3), 'z', 1.2, -2.4, { id: 'st_kuyu' });
const ST_KOZA: SlopeDef = stairs(rect(59.5, 54, 4, 1), 'z', -2.4, -1.2, { id: 'st_koza' });
const RP_HALKA: SlopeDef = ramp(rect(73, 25, 3, 6), 'x', 1.2, 2.4, { id: 'rp_halka' });

// ---- chasm (fall = open, depth 8 m: a knockback into it costs 25 % max HP, see ENGINE_VERTICALITY 11) -------------------
const CHASM = { fall: 'open', depth: 8, color: 0x0a1408, glow: 0x9cff6a, glowIntensity: 0.9 } as const;
const acid = (x: number, z: number, r: number): ZoneDef =>
  circleZone('pool', x, z, r, { color: 0x2a4a10, glow: 0x9cff6a, glowIntensity: 0.8, hazard: { coef: 0.35, interval: 1.0 } });

// ---- rooms (20) -----------------------------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  room('giris', 'Meşe Kovuğu', 2, 50, 9, 8, 'moss', 'grove', 0.35, {
    floorY: 0, ceiling: 14, ambientVfx: 'ambient_anima_motes',
    heightAreas: [area('font_dais', 5.5, 50.5, 2, 2, 0.4)],
    tiers: [tier('ring', 7.0, 2, 50, 9, 8, { depth: 3 }), tier('windows', 9.0, 2, 50, 9, 8, { count: 6, spacing: 5 }), tier('beams', 13.0, 2, 50, 9, 8)],
    zones: [circleZone('rune', 6.5, 51.5, 1.0, { color: 0x10201f, glow: 0x60ffd8, glowIntensity: 0.4 })],
    props: [
      P(gp('font_of_power'), 6.5, 51.5, { y: 0.4, tint: 0xb8ffe0, light: lt(0x60ffd8, 1.0, 8, false) }),
      P(gp('waypoint_stone'), 3.5, 56, { tint: 0x80ffe0 }),
      P(hw('lantern_hanging'), 4, 51, { y: 3.95, light: lt(0x9cffe8, 1.0, 6, false) }),
      P(hw('lantern_hanging'), 7, 53, { y: 3.95, light: lt(0x9cffe8, 1.0, 6, false) }),
      P(hw('lantern_hanging'), 9, 56, { y: 3.95, light: lt(0x9cffe8, 1.0, 6, false) }),
    ],
  }),
  room('k_patika', 'Yosunlu Patika', 11, 53, 4, 2, 'moss', 'grove', 0.4, {
    floorY: 0, ceiling: 8, slopes: [ST_PATCH],
    props: [P(hw('post_skull'), 14.5, 53.5, { scale: 1 }), P(hw('post_skull'), 14.5, 54.5, { scale: 1 })],
  }),
  room('drust_kampi', 'Boynuzlu Ahali Kampı', 15, 46, 13, 13, 'dirt', 'grove', 0.5, {
    floorY: 1.2, ceiling: 7, openAir: true, fog: fog(0x1c1426, 6, 32),
    heightAreas: [area('ritual_dais', 19.5, 49.5, 4, 5, 1.6)],
    tiers: [tier('ring', 5.0, 15, 46, 13, 13, { depth: 2 }), tier('colonnade', 0, 15, 46, 13, 13, { count: 8, spacing: 6 })],
    zones: [circleZone('rune', 21.5, 52, 3.4, { color: 0x1a1020, glow: 0xb060ff, glowIntensity: 0.5 })],
    props: [
      P(gp('tent'), 17, 48, { tint: 0x4a3050 }), P(gp('tent'), 26, 48, { tint: 0x4a3050 }),
      P(gp('tent'), 17, 56, { tint: 0x4a3050 }), P(gp('tent'), 26, 56, { tint: 0x4a3050 }),
      P(gp('brazier'), 16, 47, { light: lt(0xb060ff, 1.6, 9, true, 1.4) }), P(gp('brazier'), 27, 47, { light: lt(0xb060ff, 1.6, 9, true, 1.4) }),
      P(gp('brazier'), 16, 57, { light: lt(0xb060ff, 1.6, 9, true, 1.4) }), P(gp('brazier'), 27, 57, { light: lt(0xb060ff, 1.6, 9, true, 1.4) }),
      P(gp('iron_cage'), 16, 52), P(gp('iron_cage'), 26, 52),
      P(dg('barrel_large'), 25.5, 56.5), P(dg('barrel_large'), 25.5, 58), P(gp('cauldron'), 21.5, 56.5),
    ],
  }),
  room('k_ritual', 'Ritüel Yolu', 21, 42, 2, 4, 'dirt', 'grove', 0.2, {
    floorY: 2.4, ceiling: 10, slopes: [ST_RITUAL],
    tiers: [tier('beams', 9.0, 21, 42, 2, 4)],
    props: [P(hw('post_skull'), 21.5, 43), P(gp('brazier'), 22.6, 43.2, { light: lt(0xff5090, 1.5, 8, true, 1.2) })],
  }),
  room('ingra_arena', 'Boynuz Çemberi', 15, 29, 14, 13, 'dirt', 'grove', 0.15, {
    floorY: 2.4, ceiling: 8, openAir: true, boss: 1, explicitDecor: true, fog: fog(0x261830, 7, 36),
    tiers: [tier('ring', 7.0, 15, 29, 14, 13, { depth: 3 }), tier('balcony', 9.0, 18.5, 29, 7, 1.5, { wall: true })],
    zones: [
      circleZone('rune', 21.5, 35, 5.6, { color: 0x1c1024, glow: 0xb060ff, glowIntensity: 0.7 }),
      circleZone('rune', 21.5, 35, 2.4, { color: 0x1c1024, glow: 0xff5090, glowIntensity: 0.6 }),
    ],
    props: [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => P(kn('stone_tallB'), 21.5 + 4.5 * Math.cos((i * Math.PI) / 4), 35 + 4.5 * Math.sin((i * Math.PI) / 4), { scale: 3.2, tint: 0x70607a })),
      P(gp('altar'), 21.5, 30.5, { tint: 0x7a3a8a }),
      P(gp('statue_hooded'), 19.5, 31, { tint: 0x4a3a5a }), P(gp('statue_hooded'), 23.5, 31, { tint: 0x4a3a5a }),
    ],
  }),
  room('kok_salonu', 'Kök Salonu', 16, 21, 12, 8, 'moss', 'grove', 0.45, {
    floorY: 4.8, ceiling: 26, fog: fog(0x1f3a2c, 9, 44), slopes: [ST_KOK], lightColor: 0xd6b8ff,
    heightAreas: [area('landing', 16, 27, 12, 2, 2.4)],
    tiers: [tier('ring', 12.0, 16, 21, 12, 8, { depth: 4 }), tier('colonnade', 4.8, 16, 21, 12, 8, { count: 10, spacing: 4 }), tier('windows', 16.0, 16, 21, 12, 8, { count: 8, spacing: 5 }), tier('beams', 25.0, 16, 21, 12, 8)],
    props: [
      P(gp('crystal_blue'), 18, 23, { tint: 0xb8ffe0, light: lt(0xffd060, 1.0, 5, true) }),
      P(gp('crystal_blue'), 25, 24, { tint: 0xb8ffe0, light: lt(0xffd060, 1.0, 5, true) }),
      P(kn('lily_small'), 22, 22), P(kn('lily_small'), 26, 25),
      // high fill for the ring gallery and the beam height: floating crystals on the ring, one lantern chandelier under the beams
      P(gp('crystal_blue'), 17, 22, { y: 12.5, scale: 0.6, tint: 0xb8ffe0, light: lt(0xb8ffe0, 1.5, 12, true, 1.0) }),
      P(gp('crystal_blue'), 27, 28, { y: 12.5, scale: 0.6, tint: 0xb8ffe0, light: lt(0xb8ffe0, 1.5, 12, true, 1.0) }),
      ...chandelier(22, 25, 19, { color: 0xc8ffd8 }),
    ],
  }),
  room('mantar_korusu', 'Mantar Korusu', 6, 21, 10, 8, 'moss', 'grove', 0.4, {
    floorY: 4.4, ceiling: 12, optional: true, fog: fog(0x10281e, 5, 30),
    heightAreas: [area('shrine_mound', 9.5, 23.5, 2, 2, 4.8)],
    tiers: [tier('ring', 8.0, 6, 21, 10, 8, { depth: 2 })],
    zones: [circleZone('pool', 10.5, 24.5, 2.0, { color: 0x1a4a40, glow: 0x60ffd8, glowIntensity: 0.5 })],
    props: [
      P(kn('mushroom_redTall'), 8, 23, { scale: 10, tint: 0xe04050 }), P(kn('mushroom_tanTall'), 13, 23, { scale: 10, tint: 0x70f0d0 }),
      P(kn('mushroom_redGroup'), 8, 28, { scale: 10, tint: 0xe04050 }), P(kn('mushroom_tanGroup'), 13, 28, { scale: 10, tint: 0x70f0d0 }),
    ],
  }),
  room('m1', 'Sis Kıvrımı I', 16, 10, 8, 11, 'moss', 'grove', 0.3, {
    floorY: 4.8, ceiling: 18, openAir: true, fog: fog(0x7a98b0, 7, 30),
    tiers: [tier('colonnade', 0, 16, 10, 8, 11, { count: 6, spacing: 5 }), tier('beams', 16.0, 16, 10, 8, 11)],
    zones: [circleZone('rune', 19.5, 15, 2.0, { color: 0x10201f, glow: 0x80c0ff, glowIntensity: 0.3 })],
    props: [P(kn('statue_ring'), 19.5, 15, { scale: 3 }), P(gp('statue_hooded'), 17.5, 13, { tint: 0xdce8f0, opacity: 0.7 })],
  }),
  room('m2', 'Sis Kıvrımı II', 24, 10, 8, 11, 'moss', 'grove', 0.3, {
    floorY: 5.2, ceiling: 18, openAir: true, fog: fog(0x7a98b0, 7, 30),
    tiers: [tier('colonnade', 0, 24, 10, 8, 11, { count: 6, spacing: 5 }), tier('beams', 16.0, 24, 10, 8, 11)],
    zones: [circleZone('rune', 27.5, 15, 2.0, { color: 0x10201f, glow: 0x80c0ff, glowIntensity: 0.3 })],
    props: [P(kn('statue_obelisk'), 27.5, 15, { scale: 3 }), P(gp('statue_hooded'), 25.5, 13, { tint: 0xdce8f0, opacity: 0.7 })],
  }),
  room('m3', 'Sis Kıvrımı III', 32, 10, 8, 11, 'moss', 'grove', 0.3, {
    floorY: 5.6, ceiling: 18, openAir: true, fog: fog(0x7a98b0, 7, 30),
    tiers: [tier('colonnade', 0, 32, 10, 8, 11, { count: 6, spacing: 5 }), tier('beams', 16.0, 32, 10, 8, 11)],
    zones: [circleZone('rune', 35.5, 15, 2.0, { color: 0x10201f, glow: 0x80c0ff, glowIntensity: 0.3 })],
    props: [P(kn('statue_ring'), 35.5, 15, { scale: 3 }), P(gp('statue_hooded'), 33.5, 13, { tint: 0xdce8f0, opacity: 0.7 })],
  }),
  room('m4', 'Sis Kıvrımı IV', 40, 10, 8, 11, 'moss', 'grove', 0.3, {
    floorY: 6.0, ceiling: 18, openAir: true, fog: fog(0x7a98b0, 7, 30),
    tiers: [tier('colonnade', 0, 40, 10, 8, 11, { count: 6, spacing: 5 }), tier('beams', 16.0, 40, 10, 8, 11)],
    zones: [circleZone('rune', 43.5, 15, 2.0, { color: 0x10201f, glow: 0x80c0ff, glowIntensity: 0.3 })],
    props: [P(kn('statue_obelisk'), 43.5, 15, { scale: 3 }), P(gp('statue_hooded'), 41.5, 13, { tint: 0xdce8f0, opacity: 0.7 })],
  }),
  room('sis_cagiran_cayiri', 'Sis Çağıran Çayırı', 48, 6, 13, 15, 'moss', 'grove', 0.15, {
    floorY: 6.4, ceiling: 16, openAir: true, boss: 2, explicitDecor: true, fog: fog(0x3a5070, 6, 34),
    heightAreas: [area('stump_outer', 51, 10, 6, 6, 6.8), area('stump_inner', 52, 11, 4, 4, 7.2)],
    tiers: [tier('ring', 11.0, 48, 6, 13, 15, { depth: 2 })],
    zones: [circleZone('pool', 54, 13, 4.0, { color: 0x1a3a58, glow: 0x60c8ff, glowIntensity: 0.45 }), circleZone('dais', 54, 13, 1.8)],
    props: [P(kn('stump_squareDetailedWide'), 54, 13, { scale: 8 }), P(gp('statue_hooded'), 49, 9, { tint: 0xdce8f0 })],
  }),
  room('selale_kenari', 'Şelale Kenarı', 61, 12, 6, 6, 'moss', 'grove', 0.2, {
    floorY: 6.4, ceiling: 16, openAir: true, fog: fog(0x2a4858, 6, 36),
    heightAreas: [area('hop_edge', 64, 17, 3, 1, 6.4, 'ledge')],
    props: [P(kn('cliff_waterfall_rock'), 64, 17, { scale: 4 }), P(kn('lily_large'), 66, 13)],
  }),
  room('havuz', 'Çağlayan Havuzu', 61, 18, 6, 6, 'moss', 'cave', 0.3, {
    floorY: 6.4, ceiling: 24, openAir: true, fog: fog(0x2a4858, 6, 36), slopes: [ST_SELALE],
    heightAreas: [area('top_landing', 61, 18, 3, 1, 6.4, 'ledge'), area('plunge_pool', 64, 18, 3, 6, 1.2)],
    zones: [rectZone('pool', 64, 18, 3, 6, { color: 0x1a4a68, glow: 0x70e0ff, glowIntensity: 0.6 })],
    props: [P(kn('lily_large'), 65, 21), P(gp('rock_large'), 65.5, 23.5)],
  }),
  room('yuva_magarasi', 'Dikenfak Mağarası', 58, 24, 15, 8, 'gorm', 'cave', 0.6, {
    floorY: 1.2, ceiling: 22, fog: fog(0x142418, 5, 30),
    tiers: [tier('ring', 9.0, 58, 24, 15, 8, { depth: 3 }), tier('beams', 21.0, 58, 24, 15, 8)],
    zones: [acid(64, 27.5, 1.5), acid(70, 25.5, 1.4), acid(66.5, 30.5, 1.2)],
    props: [P(gp('rock_cliff'), 60, 25), P(gp('rock_cliff'), 71, 31), P(gp('bone_pile'), 60, 30, { tint: 0x8a8a50 })],
  }),
  // written in widened coordinates already (not in WIDENED): 4 wide, bridge on the two middle columns
  room('yuva_koprusu', 'Çürük Köprü', 60, 33, 4, 6, 'gorm', 'cave', 0.2, {
    floorY: 1.2, ceiling: 20, fog: fog(0x142418, 5, 30),
    tiers: [tier('beams', 19.0, 60, 33, 4, 6)],
    zones: [rectZone('bridge', 61, 33, 2, 6, { y: 1.2 }), rectZone('void', 60, 33, 1, 6, CHASM), rectZone('void', 63, 33, 1, 6, CHASM)],
    props: [
      ...[0, 1, 2].map((i) => P(kn('bridge_woodNarrow'), 61.5, 34 + i * 2, { rot: 90, scale: 4 })),
    ],
  }),
  room('yan_tunel', 'Kök Kestirmesi', 58, 32, 2, 6, 'dirt', 'cave', 0.4, {
    floorY: 1.2, ceiling: 6, skip: true, fog: fog(0x142418, 5, 30),
    props: [P(kn('hanging_moss'), 58.5, 35, { tint: 0x9cff6a })],
  }),
  room('yuva_kuyusu', 'Larva Kuyusu', 56, 38, 9, 8, 'gorm', 'cave', 0.4, {
    floorY: -2.4, ceiling: 20, fog: fog(0x142418, 5, 30), slopes: [ST_KUYU],
    heightAreas: [area('top_landing', 56, 38, 9, 1, 1.2)],
    tiers: [tier('ring', 4.0, 56, 38, 9, 8, { depth: 2.5 })],
    zones: [acid(60, 43.2, 1.6)],
    props: [P(gp('bone_pile'), 63, 44, { tint: 0x8a8a50 }), P(gp('rock_cliff'), 57, 45)],
  }),
  room('tredova_magarasi', 'Dikenfak Yuvası', 54, 46, 16, 13, 'gorm', 'cave', 0.15, {
    floorY: -2.4, ceiling: 30, boss: 3, explicitDecor: true, lightColor: 0x80ffe0, fog: fog(0x0f1c14, 8, 42), slopes: [ST_KOZA],
    heightAreas: [area('cocoon_dais', 59.5, 55, 4, 3, -1.2, 'rail')],
    tiers: [tier('ring', 8.0, 54, 46, 16, 13, { depth: 3 }), tier('colonnade', 0, 54, 46, 16, 13, { count: 8, spacing: 8 }), tier('beams', 27.0, 54, 46, 16, 13)],
    zones: [
      circleZone('rune', 61.5, 51, 6.0, { color: 0x10201f, glow: 0x9cff6a, glowIntensity: 0.4 }),
      circleZone('dais', 61.5, 56.5, 2.4),
      acid(56.5, 49.5, 2.0), acid(66.5, 55, 2.2),
    ],
    props: [P(gp('crystal_blue'), 60, 55, { tint: 0x80ffe0, light: lt(0x80ffe0, 2.2, 7, false) }), P(gp('crystal_blue'), 63, 57, { tint: 0x80ffe0 })],
  }),
  room('peri_halkasi', 'Peri Halkası', 73, 25, 3, 6, 'moss', 'grove', 0.3, {
    floorY: 1.2, ceiling: 10, optional: true, openAir: true, fog: fog(0x10281e, 5, 30), slopes: [RP_HALKA],
    zones: [circleZone('rune', 74.5, 28, 1.3, { color: 0x10201f, glow: 0x60ffd8, glowIntensity: 0.6 })],
    props: [
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => P(kn('mushroom_redGroup'), 74.5 + 1.0 * Math.cos((i * Math.PI) / 6), 28 + 1.0 * Math.sin((i * Math.PI) / 6), { scale: 12, tint: 0xe04050 })),
      P(gp('chest_gold'), 74.5, 29.8),
    ],
  }),
  room('tredova_yolu', 'Dikenfak Geçidi', 58, 48, 2, 6, 'gorm', 'cave', 0.2, { floorY: -2.4, ceiling: 10 }),
  room('tredova_cikis', 'Yuva Çıkışı', 58, 67, 6, 4, 'gorm', 'cave', 0.2, { floorY: -2.4, ceiling: 8 }),
];

// ---- doors (29) -----------------------------------------------------------------------------------------------------------
// Doors 6 and 25 would be channel gates (Kök Kapısı, ChannelGate not built yet): they are open for now.
// (widened coordinates: the tile sits on the room's own edge, as before)
const DOORS: DoorDef[] = [
  door('giris', 'k_patika', 10, 53, 'e', 2, 'none'),
  door('k_patika', 'drust_kampi', 14, 53, 'e', 2, 'none'),
  door('drust_kampi', 'k_ritual', 21, 46, 'n', 2, 'none'),
  door('k_ritual', 'ingra_arena', 20, 42, 'n', 4, 'boss_lock'),
  door('ingra_arena', 'kok_salonu', 20, 29, 'n', 4, 'boss_exit'),
  door('kok_salonu', 'mantar_korusu', 16, 22, 'w', 2, 'none'),
  door('kok_salonu', 'm1', 19, 19, 'n', 2, 'none'),
  door('m1', 'm2', 23, 11, 'e', 2, 'none'),
  { ...door('m1', 'm2', 23, 15, 'e', 2, 'kill_lock'), opensOn: { pack: 'ps_p10' } }, // decoy lane: shut until the m1 guardian pack dies
  door('m2', 'm3', 33, 11, 'e', 2, 'none'),
  door('m2', 'm3', 33, 15, 'e', 2, 'none'),
  door('m3', 'm4', 42, 11, 'e', 2, 'none'),
  door('m3', 'm4', 42, 15, 'e', 2, 'none'),
  door('m4', 'sis_cagiran_cayiri', 51, 13, 'e', 4, 'boss_lock'),
  door('sis_cagiran_cayiri', 'selale_kenari', 64, 12, 'e', 4, 'boss_exit'),
  door('selale_kenari', 'havuz', 66, 17, 's', 2, 'none'),
  door('havuz', 'yuva_magarasi', 66, 23, 's', 2, 'none'),
  door('yuva_magarasi', 'yuva_koprusu', 61, 32, 's', 2, 'none'),
  { ...door('yuva_magarasi', 'yan_tunel', 58, 32, 's', 2, 'kill_lock'), opensOn: { boss: 'boss_sis_cagiran' } },
  door('yuva_koprusu', 'yuva_kuyusu', 61, 38, 's', 2, 'none'),
  door('yan_tunel', 'yuva_kuyusu', 58, 38, 's', 2, 'none'),
  door('yuva_kuyusu', 'tredova_yolu', 58, 47, 's', 2, 'none'),
  door('tredova_yolu', 'tredova_magarasi', 58, 53, 's', 2, 'boss_lock'),
  door('tredova_magarasi', 'tredova_cikis', 58, 66, 's', 4, 'boss_exit'),
  door('yuva_magarasi', 'peri_halkasi', 74, 26, 'e', 2, 'none'),
];

// ---- packs (30; forces are the member sums, 463 in total) --------------------------------------------------------------
const BRIDGE_LANE = (): PackDef => pack('ps_p25', 'yuva_koprusu', 61.5, 35.5, undefined, [
  ['ps_gorger', 0, -1.75], ['ps_gorger', 0, -1.25],
  ['ps_larva', 0, -0.75], ['ps_larva', 0, -0.25], ['ps_larva', 0, 0.25], ['ps_larva', 0, 0.75],
]);

const PACKS: PackDef[] = [
  packN('ps_p00', 'giris', 7.5, 56, [['ps_villager', 2], ['ps_spiteclaw', 1]]),
  packN('ps_p01', 'drust_kampi', 18, 56, [['ps_spiteclaw', 4], ['ps_villager', 2]], { stealth: true }),
  packN('ps_p02', 'drust_kampi', 19.5, 50, [['ps_soulcleaver', 2], ['ps_harvester', 1], ['ps_villager', 1]]),
  packN('ps_p03', 'drust_kampi', 24.5, 51, [['ps_soulcleaver', 2], ['ps_harvester', 2]], { big: true }),
  packN('ps_p04', 'drust_kampi', 22, 47.5, [['ps_boughbreaker', 1], ['ps_soulcleaver', 1]]),
  packN('ps_p05', 'drust_kampi', 21, 56, [['ps_spiteclaw', 3], ['ps_soulcleaver', 1]], { patrol: [[25.5, 56], [19, 56]] }),
  // two-tile corridor: members in a line along z (the spiral would hug the walls)
  pack('ps_p06', 'k_ritual', 22, 43.6, undefined, [['ps_harvester', 0, -0.45], ['ps_villager', 0, 0.45]]),
  packN('ps_p07', 'kok_salonu', 18.5, 22.5, [['ps_soulcleaver', 1], ['ps_harvester', 1], ['ps_spiteclaw', 4]]),
  packN('ps_p08', 'kok_salonu', 24, 22.5, [['ps_villager', 1], ['ps_harvester', 1]]),
  packN('ps_p09', 'mantar_korusu', 10.5, 26.8, [['ps_villager', 1], ['ps_stalker', 1]], { optional: true }),
  packN('ps_p10', 'm1', 19.5, 17, [['ps_guardian', 2], ['ps_shaper', 1], ['ps_stinger', 1]], { linkedTo: ['ps_p11'] }),
  packN('ps_p11', 'm1', 20, 12.5, [['ps_stalker', 2], ['ps_villager', 1]], { linkedTo: ['ps_p10'] }),
  packN('ps_p12', 'm2', 27.5, 15, [['ps_matriarch', 1], ['ps_guardian', 2]], { big: true }),
  packN('ps_p13', 'm2', 27, 11.5, [['ps_tender', 1], ['ps_stinger', 2], ['ps_guardian', 1]]),
  packN('ps_p14', 'm3', 35.5, 15, [['ps_guardian', 2], ['ps_shaper', 1], ['ps_tender', 1], ['ps_stinger', 1], ['ps_stalker', 1]], { big: true }),
  packN('ps_p15', 'm3', 35.5, 19, [['ps_nightblossom', 1], ['ps_villager', 1]]),
  packN('ps_p16', 'm3', 34, 11.5, [['ps_stinger', 2], ['ps_guardian', 1]]),
  packN('ps_p17', 'm4', 43.5, 16.5, [['ps_shaper', 1], ['ps_guardian', 2], ['ps_stinger', 1]]),
  packN('ps_p18', 'm4', 43.5, 12, [['ps_villager', 1], ['ps_stalker', 1]]),
  packN('ps_p19', 'm4', 43.5, 15, [['ps_guardian', 1], ['ps_stinger', 1]], { patrol: [[41, 19], [46, 19], [46, 11], [41, 11]] }),
  packN('ps_p20', 'havuz', 65, 21, [['ps_gorger', 1], ['ps_villager', 1]]),
  packN('ps_p21', 'yuva_magarasi', 61, 27.5, [['ps_staghorn', 1], ['ps_gorger', 2]], { stealth: true }),
  packN('ps_p22', 'yuva_magarasi', 66, 26, [['ps_larva', 7], ['ps_reaver', 1]], { dormant: { kind: 'egg', wakeRadius: 6 } }),
  packN('ps_p23', 'yuva_magarasi', 68.5, 29.5, [['ps_gorger', 2], ['ps_reaver', 1], ['ps_staghorn', 1]]),
  packN('ps_p24', 'yuva_magarasi', 63.5, 30, [['ps_reaver', 2], ['ps_gorger', 2]]),
  BRIDGE_LANE(),
  packN('ps_p26', 'yan_tunel', 58.5, 34.5, [['ps_staghorn', 1], ['ps_gorger', 1]]),
  packN('ps_p27', 'yuva_kuyusu', 57.5, 42.8, [['ps_staghorn', 1], ['ps_gorger', 2], ['ps_reaver', 1]]),
  packN('ps_p28', 'yuva_kuyusu', 63, 43.3, [['ps_larva', 7], ['ps_staghorn', 1]], { dormant: { kind: 'egg', wakeRadius: 6 } }),
  packN('ps_p29', 'yuva_kuyusu', 60, 44.6, [['ps_staghorn', 1], ['ps_gorger', 1]]),
  // three-tile knoll ramp: explicit offsets inside the 3-tile width
  pack('ps_p30', 'peri_halkasi', 74.5, 27.5, undefined, [
    ['ps_gorger', 0, -1], ['ps_gorger', 0, 1], ['ps_larva', -0.5, 0], ['ps_larva', 0.5, 0], ['ps_larva', -0.5, 1.5], ['ps_larva', 0.5, -1.5],
  ], { optional: true }),
];

// ---- widening pass (scale pass, same method as the kemik_mahzeni and buzul_tahti pilots) -------------------------------
// Rooms, props, zones, slopes, tiers, packs, bosses and extras are written in the OLD layout and remapped here into the
// widened rects. Helper copied from rescale.ts (not imported): a room edge sits at centre - 0.5 for points, rect edges map
// edge to edge. Rooms not listed in WIDENED keep their rect (their literals are already final).
type R4 = [number, number, number, number];
const WIDENED: Record<string, R4> = {
  k_patika: [11, 51, 4, 4], k_ritual: [20, 42, 4, 4], kok_salonu: [16, 19, 12, 10], mantar_korusu: [6, 19, 10, 10],
  m1: [16, 11, 8, 8], m2: [24, 9, 10, 9], m3: [34, 9, 9, 11], m4: [43, 9, 9, 8],
  sis_cagiran_cayiri: [52, 6, 13, 15], selale_kenari: [65, 12, 6, 6], havuz: [65, 18, 6, 6],
  yuva_magarasi: [58, 24, 17, 9], peri_halkasi: [75, 24, 9, 9], yan_tunel: [58, 33, 2, 6],
  yuva_kuyusu: [56, 39, 9, 9], tredova_magarasi: [54, 54, 16, 13],
};
const OLD_RECT: Record<string, R4> = {};
for (const r of ROOMS) OLD_RECT[r.id] = [r.rect.x, r.rect.z, r.rect.w, r.rect.h];
const newRect = (id: string): R4 => WIDENED[id] ?? OLD_RECT[id];
const r05 = (v: number): number => Math.round(v * 2) / 2;

/** Old-layout point -> new-layout point inside room `id`. */
function mapPt(id: string, x: number, z: number): [number, number] {
  const [ox, oz, ow, oh] = OLD_RECT[id];
  const [nx, nz, nw, nh] = newRect(id);
  return [nx - 0.5 + (x - ox + 0.5) * (nw / ow), nz - 0.5 + (z - oz + 0.5) * (nh / oh)];
}
/** The room whose old rect is nearest to an old-layout point (points on a wall line go to the room they sit in). */
function roomOf(x: number, z: number): string {
  let best = ROOMS[0].id;
  let bd = Infinity;
  for (const id of Object.keys(OLD_RECT)) {
    const [ox, oz, ow, oh] = OLD_RECT[id];
    const dx = Math.max(ox - 0.5 - x, 0, x - (ox + ow - 0.5));
    const dz = Math.max(oz - 0.5 - z, 0, z - (oz + oh - 0.5));
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
const wpt = (x: number, z: number): [number, number] => mapPt(roomOf(x, z), x, z);
/** Rect in room `id` mapped edge to edge (tile multiples of 0.5). */
function mapRect(id: string, r: TileRect): TileRect {
  const [ox, oz, ow, oh] = OLD_RECT[id];
  const [nx, nz, nw, nh] = newRect(id);
  const sx = nw / ow, sz = nh / oh;
  return { x: r05(nx + (r.x - ox) * sx), z: r05(nz + (r.z - oz) * sz), w: r05(r.w * sx), h: r05(r.h * sz) };
}
/** Circle zones keep their shape (centre mapped, radius scaled by the smaller axis factor). */
function mapZone(id: string, z: ZoneDef): ZoneDef {
  if (z.shape !== 'circle') return { ...z, rect: mapRect(id, z.rect) };
  const [ox, oz, ow, oh] = OLD_RECT[id];
  const [, , nw, nh] = newRect(id);
  const cx = z.rect.x + z.rect.w / 2 - 0.5;
  const cz = z.rect.z + z.rect.h / 2 - 0.5;
  const [x2, z2] = mapPt(id, cx, cz);
  const r = (z.rect.w / 2) * Math.min(nw / ow, nh / oh);
  return { ...z, rect: { x: x2 + 0.5 - r, z: z2 + 0.5 - r, w: 2 * r, h: 2 * r } };
}
/** Boss placement written in old coordinates. */
const bossW = (bossId: string, roomId: string, x: number, z: number, facing: number, order: number) => {
  const [nx, nz] = mapPt(roomId, x, z);
  return bossAt(bossId, roomId, nx, nz, facing, order);
};

for (const r of ROOMS) {
  const id = r.id;
  const [nx, nz, nw, nh] = newRect(id);
  r.rect = { x: nx, z: nz, w: nw, h: nh };
  if (r.props) for (const p of r.props) p.pos = mapPt(id, p.pos[0], p.pos[1]);
  if (r.zones) r.zones = r.zones.map((z) => mapZone(id, z));
  if (r.heightAreas) r.heightAreas = r.heightAreas.map((a) => ({ ...a, rect: mapRect(id, a.rect) }));
  if (r.slopes) r.slopes = r.slopes.map((s) => ({ ...s, rect: mapRect(id, s.rect) }));
  if (r.tiers) r.tiers = r.tiers.map((t) => ({ ...t, rect: mapRect(id, t.rect) }));
}
for (const p of PACKS) {
  p.center = mapPt(p.roomId, p.center[0], p.center[1]);
  if (p.patrol) p.patrol = p.patrol.map(([x, z]) => mapPt(p.roomId, x, z));
}

// ---- mood, ambience and dressing (final coordinates; hand placed ring of mushrooms and lily pads, every third one lit) ------
const CALM = ['giris', 'k_patika', 'drust_kampi', 'kok_salonu', 'mantar_korusu', 'selale_kenari', 'havuz', 'peri_halkasi', 'yan_tunel'];
const TENSE = ['k_ritual', 'm1', 'm2', 'm3', 'm4', 'yuva_magarasi', 'yuva_koprusu', 'yuva_kuyusu'];
const SET_PIECE = ['ingra_arena', 'sis_cagiran_cayiri', 'tredova_magarasi'];
const MOOD: Record<string, string> = Object.fromEntries([
  ...CALM.map((id) => [id, 'calm']), ...TENSE.map((id) => [id, 'tension']), ...SET_PIECE.map((id) => [id, 'setpiece']),
]);
const AMBIENCE: Record<string, NonNullable<RoomDef['ambience']>> = {
  giris: [{ id: 'whisper', radius: 10, volume: 0.15, loop: true }],
  drust_kampi: [{ id: 'crowd_murmur', radius: 14, volume: 0.15, loop: true }],
  kok_salonu: [{ id: 'whisper', radius: 12, volume: 0.2, loop: true }],
  mantar_korusu: [{ id: 'whisper', radius: 8, volume: 0.15, loop: true }],
  m1: [{ id: 'whisper', radius: 9, volume: 0.15, loop: true }],
  m2: [{ id: 'whisper', radius: 9, volume: 0.15, loop: true }],
  m3: [{ id: 'whisper', radius: 9, volume: 0.15, loop: true }],
  m4: [{ id: 'whisper', radius: 9, volume: 0.15, loop: true }],
  sis_cagiran_cayiri: [{ id: 'whisper', radius: 12, volume: 0.25, loop: true }],
  selale_kenari: [{ id: 'water_lap', radius: 8, volume: 0.3, loop: true }],
  havuz: [{ id: 'water_lap', radius: 8, volume: 0.35, loop: true }],
  yuva_magarasi: [{ id: 'rubble', radius: 10, volume: 0.15, loop: true }],
  yuva_kuyusu: [{ id: 'rubble', radius: 8, volume: 0.2, loop: true }],
  tredova_magarasi: [{ id: 'whisper', radius: 14, volume: 0.3, loop: true }],
};
const DRESS_COLOR: Record<string, number> = {
  ingra_arena: 0xb060ff, sis_cagiran_cayiri: 0x60c8ff, tredova_magarasi: 0x9cff6a,
  yuva_magarasi: 0x9cff6a, yuva_kuyusu: 0x9cff6a, yuva_koprusu: 0x9cff6a, yan_tunel: 0x9cff6a,
};
/** Points on the inset ring of a room (walked clockwise from the north-west corner), n of them, evenly spaced. */
function ringPoints(rc: TileRect, n: number, inset: number): [number, number][] {
  const x0 = rc.x + inset, z0 = rc.z + inset, w = rc.w - 2 * inset, h = rc.h - 2 * inset;
  const per = 2 * (w + h);
  return Array.from({ length: n }, (_, i) => {
    let d = (i / n) * per;
    if (d < w) return [x0 + d, z0];
    d -= w;
    if (d < h) return [x0 + w, z0 + d];
    d -= h;
    if (d < w) return [x0 + w - d, z0 + h];
    d -= w;
    return [x0, z0 + h - d];
  });
}
const DRESS_MODELS = [kn('mushroom_redGroup'), kn('mushroom_tanGroup'), kn('lily_small'), kn('lily_large')];
for (const r of ROOMS) {
  r.atmosphere = MOOD[r.id];
  if (AMBIENCE[r.id]) r.ambience = AMBIENCE[r.id];
  r.ambientVfx ??= r.wall === 'cave' ? 'ambient_shadow_wisps' : 'ambient_anima_motes';
  const n = Math.max(8, Math.min(14, Math.round((2 * (r.rect.w + r.rect.h)) / 3)));
  const color = DRESS_COLOR[r.id] ?? 0x80ffe0;
  const extra = ringPoints(r.rect, n, 0.8).map(([x, z], i) => {
    const model = DRESS_MODELS[i % DRESS_MODELS.length];
    const mush = model.includes('mushroom');
    return P(model, x, z, { ...(mush ? { scale: 6 } : {}), ...(i % 3 === 0 ? { light: lt(color, 1.0, 6, true) } : {}) });
  });
  r.props = [...(r.props ?? []), ...extra];
}

// lieutenant packs (elite ids: ps_staghorn, ps_nightblossom); final coordinates, appended after the widening pass
PACKS.push(
  packN('ps_p32', 'kok_salonu', 22, 25, [['ps_staghorn', 1], ['ps_guardian', 2]]),
  packN('ps_p33', 'selale_kenari', 67.5, 14.5, [['ps_nightblossom', 1], ['ps_gorger', 2]]),
);

// ---- dungeon ----------------------------------------------------------------------------------------------------------
const THEME: DungeonTheme = {
  fogColor: 0x122428, fogNear: 6, fogFar: 32,
  ambient: 0x2e4262, ambientIntensity: 0.38,
  hemiSky: 0x5a7098, hemiGround: 0x122014,
  torchColor: 0xb878ff, bloomStrength: 0.55,
  music: 'dungeon_peri_sisleri', palette: [0x10201f, 0x2f5a3c, 0x7ab0d8, 0xffd060, 0x60ffd8, 0xb060ff], tint: 0xb8d0b0,
  moon: { color: 0xa0ffe0, intensity: 0.4 }, rim: { color: 0x60ffd8, intensity: 0.4 },
};

export const PERI_SISLERI: DungeonDef = {
  id: 'peri_sisleri',
  name: 'Peri Sisleri',
  shortName: 'Sisler',
  lore: 'Kadim Diyar\'ın Gümüş Ormanı\'nda, dünya meşesinin son dalı bir kovuk saklar: Peri Sisleri. Boynuzlu Ahali kovuğa sızdı; Ingra Malok peri ruhlarının animasını kara büyüyle çekiyor, kuraklık sisleri yutuyor. Sisin ortasındaki labirent yanlış adımı affetmez, yuvanın dibinde ise Tred\'ova, Lakali\'nin tohumunu yuttu. Zaman daralıyor.',
  levelRange: [60, 60],
  timerSec: 1770,
  forcesRequired: 424, // floor(0.8 x 531 pack forces)
  theme: THEME,
  grid: { w: 84, h: 72 },
  rooms: ROOMS,
  doors: DOORS,
  packs: PACKS,
  bosses: [
    bossW('boss_ingra_malok', 'ingra_arena', 21.5, 33, 0, 1),
    bossW('boss_sis_cagiran', 'sis_cagiran_cayiri', 56.5, 13, -90, 2),
    bossW('boss_tredova', 'tredova_magarasi', 61.5, 53, 180, 3),
  ],
  start: { pos: [4, 54], facing: 90 },
  exit: { pos: pt(60, 69) },
  extras: {
    fontOfPower: wpt(6.5, 51.5),
    shrines: [{ type: 'shrine_power', pos: wpt(10.5, 24.5) }, { type: 'shrine_haste', pos: wpt(74.5, 28) }],
    riftSpots: ([[26.5, 47.5], [26.5, 27.5], [17, 19], [29.5, 20], [37.5, 12], [64, 14.5], [70.5, 25.5], [59.5, 30.5]] as [number, number][])
      .map(([x, z]) => wpt(x, z)),
    chests: [{ pos: wpt(8, 22.5), kind: 'chest_wood' }, { pos: wpt(74.5, 29.8), kind: 'chest_gold' }],
    checkpoints: [wpt(63.5, 44.5)],
    // spore station in the optional mushroom mound (one use per run per player)
    stations: [{ id: 'ps_mantar_istasyonu', pos: wpt(10.5, 26.5), status: 'haste', duration: 300, magnitude: 0.1 }],
  },
  season: 1,
  endgame: true,
  vertical: true,
  lifts: [],
  atmospheres: {
    calm: { color: 0x122428, near: 6, far: 32 },
    tension: { color: 0x0f1c14, near: 6, far: 26 },
    setpiece: { color: 0x261830, near: 9, far: 40 },
  },
};

export const PERI_SISLERI_ROOM_COUNT = ROOMS.length;
export const PERI_SISLERI_TILE = TILE;
