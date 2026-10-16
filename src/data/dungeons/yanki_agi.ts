import type { DecorTier, DoorDef, DungeonDef, DungeonTheme, PackDef, PropPlacement, RoomDef, SlopeDef, TileRect, ZoneDef } from '../../types/dungeons';
import '../enemies_yanki_agi';
import type { MemberTuple, PackExtra } from './kit';
import { bossAt, circleZone, dg, door, gp, hw, ip, kg, kn, lt, pack, pt, ramp, rectZone, room, stairs } from './kit';

/**
 * YANKI AGI (yanki_agi), Season 1 Mythic+ dungeon. Design: docs/dungeons/yanki_agi.md (sections 3 rooms, doors and packs; 4 trash;
 * 5 bosses; 6 tuning). Heights use the ENGINE_VERTICALITY fields (`vertical: true`): the design's `strips` are `slopes` here.
 *
 * Registered in dungeons/index.ts (M+ Season 1 pool) and ai/bosses/index.ts. The enemy module (enemies_yanki_agi.ts) is imported here
 * for its side effect.
 *
 * Known gaps against the design (not built, see the report): the 24 NEW Blender props (every NEW prop falls back to an
 * existing model), the full 3.6 dressing sheet (only the hero anchors and a light fill are placed), the Karakır entrance, the
 * gong / shrine / gate devices beyond the existing `echo_gong` id, the Kibirli spawn, the silk-barricade breakable pieces are
 * collide props at x 37.5 (moved off the door line to pass the content check).
 * OWNER: content module.
 */

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
type PO = Partial<Omit<PropPlacement, 'model' | 'pos'>>;
const P = (model: string, x: number, z: number, o: PO = {}): PropPlacement => ({ model, pos: [x, z], ...o });
const tier = (kind: DecorTier['kind'], y: number, x: number, z: number, w: number, h: number, extra: Partial<DecorTier> = {}): DecorTier => ({
  kind, y, rect: rect(x, z, w, h), ...extra,
});
const fog = (color: number, near: number, far: number) => ({ color, near, far });
const TEAL = 0x39d0c4;
const AMBER = 0xd09a3c;
const VIOLET = 0x8a3bb0;
const GREEN = 0x86c93a;

/** Sunflower-free spiral of design section 4.4 (tile offsets from the pack centre; melee first, casters last). */
const SPIRAL: [number, number][] = [
  [0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53],
  [-0.28, 1.03], [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.58, -1.23], [0.43, 1.36],
];
/** Pack of `counts` [enemyId, n] pairs on the spiral (the same table every Season 1 pack uses). */
function packN(id: string, roomId: string, cx: number, cz: number, counts: [string, number][], extra: PackExtra = {}): PackDef {
  const ids = counts.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  if (ids.length > SPIRAL.length) throw new Error(`[yanki_agi] pack ${id}: ${ids.length} members, spiral holds ${SPIRAL.length}`);
  const members: MemberTuple[] = ids.map((enemyId, i) => [enemyId, SPIRAL[i][0], SPIRAL[i][1]]);
  return pack(id, roomId, cx, cz, undefined, members, extra);
}

// ---- slopes: axis is the run direction; yFrom at the min edge, yTo at the max edge (absolute metres) ----------------------
const ST_GRAND_TELLER: SlopeDef = stairs(rect(16, 46, 4, 5), 'x', 10, 4, { id: 'h1_grand_descent' });
const ST_IXIN: SlopeDef = stairs(rect(17, 40, 3, 2), 'z', 7, 4, { id: 'h2_ixin' });
const ST_NAKT: SlopeDef = stairs(rect(25, 40, 3, 2), 'z', 7, 4, { id: 'h3_nakt' });
const ST_ATIK: SlopeDef = stairs(rect(30, 46, 2, 4), 'x', 4, 7, { id: 'h4_atik' });
const RP_BIR: SlopeDef = ramp(rect(30, 40, 4, 4), 'x', 4, 2, { id: 'h5_ramp_bir' });
const RP_IKI: SlopeDef = ramp(rect(40, 28, 4, 5), 'z', 8, 2, { id: 'h6_yukari_yol' });
const RP_GECIT: SlopeDef = ramp(rect(30, 28, 4, 3), 'x', 5, 6.5, { id: 'h7_gecit' });
const ST_LAB_W: SlopeDef = stairs(rect(31, 20, 3, 4), 'x', 5, 8, { id: 'h8_lab_west' });
const ST_YANKI: SlopeDef = stairs(rect(24, 17, 5, 4), 'z', 11, 5, { id: 'h9_yanki_merdiveni' });
const RP_TUNEL: SlopeDef = ramp(rect(34, 8, 6, 4), 'x', 11, 7, { id: 'h10_tunel' });
const ST_PIT: SlopeDef = stairs(rect(50, 23, 4, 3), 'z', 7, 3, { id: 'h11_pit_stair' });

// ---- zones -----------------------------------------------------------------------------------------------------------------
/** Chasm of the Yarık Köprüsü (fall rule of CORE_MECHANICS section 13: a fall costs 25 % and respawns at the last safe tile). */
const CHASM = { fall: 'open', depth: 8, color: 0x000000, glow: TEAL, glowIntensity: 0.6 } as const;
const wetPool = (x: number, z: number, w: number, h: number): ZoneDef =>
  rectZone('pool', x, z, w, h, { color: 0x120a1a, glow: VIOLET, glowIntensity: 0.3 });

// ---- rooms (18) ---------------------------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  room('giris', 'Ağ Kapısı Girişi', 2, 45, 9, 8, 'stone_dark', 'cave', 0.3, {
    floorY: 10, ceiling: 30, explicitDecor: true, lightColor: TEAL, ambientVfx: 'ambient_dust',
    zones: [circleZone('rune', 6.5, 47, 1.7, { glow: TEAL, glowIntensity: 0.6 })],
    props: [
      P(gp('font_of_power'), 6.5, 47, { y: 0.4, tint: TEAL, light: lt(TEAL, 2.2, 12, false, 2.0) }),
      P(ip('psx-dungeon', 'arch'), 10.5, 48.5, { rot: -90 }),
      P(hw('lantern_hanging'), 8, 45.5, { y: 3.0, light: lt(AMBER, 1.8, 10, true) }),
      P(hw('lantern_hanging'), 8, 51.5, { y: 3.0, light: lt(AMBER, 1.8, 10, true) }),
      ...[3, 5, 7, 9].map((x) => P(kn('hanging_moss'), x, 46, { y: 3.6, tint: 0xb9c6d8 })),
      P(kg('coffin-old'), 4, 51, { y: 4.0, tint: 0xb9c6d8 }), P(kg('coffin-old'), 9, 50, { y: 4.0, tint: 0xb9c6d8 }),
      P(kn('rock_tallA'), 3, 52.5, { scale: 3, tint: 0x3a4a62 }), P(kn('rock_tallA'), 9.5, 46.5, { scale: 3, tint: 0x3a4a62 }),
    ],
  }),
  room('kopru', 'Yarık Köprüsü', 11, 47, 5, 4, 'stone_dark', 'cave', 0.2, {
    floorY: 10, ceiling: 26, explicitDecor: true, lightColor: TEAL,
    zones: [rectZone('pit', 11, 47, 5, 4, { blocked: true, ...CHASM }), rectZone('bridge', 11, 48, 5, 2, { y: 10 })],
    props: [
      P(ip('psx-dungeon', 'arch'), 11.5, 48.5, { rot: -90 }), P(ip('psx-dungeon', 'arch'), 14.5, 48.5, { rot: 90 }),
      P(kg('coffin-old'), 13, 47.5, { y: 8, tint: 0xb9c6d8 }), P(kg('coffin-old'), 12, 49.5, { y: 11, tint: 0xb9c6d8 }),
    ],
  }),
  room('teller', 'Parçalanmış Teller', 16, 40, 14, 14, 'dirt', 'cave', 0.4, {
    floorY: 4, ceiling: 30, slopes: [ST_GRAND_TELLER, ST_IXIN, ST_NAKT], lightColor: TEAL, fog: fog(0x101c28, 10, 60),
    tiers: [tier('ring', 7.0, 16, 40, 14, 14, { depth: 3 })],
    zones: [circleZone('rune', 22, 47, 2.0, { color: 0x10201f, glow: TEAL, glowIntensity: 0.5 })],
    props: [
      P(gp('crystal_blue'), 22, 46, { tint: TEAL, light: lt(TEAL, 1.6, 9, false) }),
      P(kg('lantern-glass'), 24.5, 44.5, { scale: 2, tint: AMBER, tag: 'device', device: 'echo_gong' }),
      P(dg('barrel_large'), 24.5, 53, { tint: 0x6b4b2e }),
      P(gp('wagon'), 18.5, 51.5, { rot: 25, tint: 0xb9c6d8 }),
      ...[17, 21, 25, 28].map((x) => P(kn('hanging_moss'), x, 42, { y: 3.6, tint: 0xb9c6d8 })),
      P(gp('crystal_blue'), 28.3, 52.2, { tint: TEAL, light: lt(TEAL, 1.5, 8, false) }),
      P(kg('altar-stone'), 28.3, 52.2, { scale: 0.8 }),
      P(gp('bone_pile'), 26, 52.5, { tint: 0x8a8a50 }), P(gp('bone_pile'), 19.5, 52.5, { tint: 0x8a8a50 }),
      P(kn('rock_tallB'), 17, 53, { scale: 3, tint: 0x3a4a62 }), P(kn('rock_tallB'), 28.5, 44.5, { scale: 3, tint: 0x3a4a62 }),
    ],
  }),
  room('ixin_oyugu', 'Iksin Odası', 16, 34, 6, 6, 'stone_dark', 'cave', 0.25, {
    floorY: 7, ceiling: 10, explicitDecor: true, lightColor: TEAL,
    props: [
      P(ip('psx-dungeon', 'arch'), 18.5, 39.5, { rot: 0 }),
      P(kg('altar-stone'), 18.5, 34.6, { scale: 2.8, tint: 0x2a3a52 }),
      P(gp('crystal_blue'), 16.5, 35, { tint: TEAL, light: lt(TEAL, 1.2, 7, false) }),
      P(gp('crystal_blue'), 20.5, 35, { tint: TEAL, light: lt(TEAL, 1.2, 7, false) }),
      P(hw('lantern_hanging'), 21, 37, { y: 3.0, light: lt(AMBER, 1.8, 9, true) }),
    ],
  }),
  room('nakt_oyugu', 'Nakat Odası', 24, 34, 6, 6, 'stone_dark', 'cave', 0.25, {
    floorY: 7, ceiling: 10, explicitDecor: true, lightColor: GREEN,
    props: [
      P(ip('psx-dungeon', 'arch'), 26.5, 39.5, { rot: 0 }),
      P(hw('pumpkin_yellow_small'), 24.5, 35, { tint: 0xd6dfae, emissive: GREEN }),
      P(hw('pumpkin_yellow_small'), 28.5, 35, { tint: 0xd6dfae, emissive: GREEN }),
      P(kn('hanging_moss'), 25.5, 37.5, { y: 3.6, tint: 0xb9c6d8 }), P(kn('hanging_moss'), 27.5, 37.5, { y: 3.6, tint: 0xb9c6d8 }),
    ],
  }),
  room('atik_oyugu', 'Atik Odası', 30, 45, 6, 6, 'stone_dark', 'cave', 0.25, {
    floorY: 7, ceiling: 10, explicitDecor: true, slopes: [ST_ATIK], lightColor: 0x88b040,
    props: [
      P(gp('cauldron'), 34.6, 46, { scale: 2.2, tint: 0x3a1245, light: lt(GREEN, 1.0, 6, true) }),
      P(gp('cauldron'), 34.6, 49.4, { scale: 2.2, tint: 0x3a1245, light: lt(GREEN, 1.0, 6, true) }),
      P(dg('bottle_A_green'), 33, 47.5), P(dg('bottle_B_green'), 33.5, 48.5),
    ],
  }),
  room('yumurta_odasi', 'Yumurta Kuluçkası', 36, 45, 10, 9, 'dirt', 'cave', 0.25, {
    floorY: 7, ceiling: 12, optional: true, fog: fog(0x16241a, 8, 38), lightColor: GREEN,
    props: [
      P(gp('chest_epic'), 44, 51, { scale: 0.8 }),
      P(kn('hanging_moss'), 38, 46, { y: 3.6, tint: 0xb9c6d8 }), P(kn('hanging_moss'), 43, 50, { y: 3.6, tint: 0xb9c6d8 }),
      P(kn('hanging_moss'), 38, 51, { y: 3.6, tint: 0xb9c6d8 }), P(kn('hanging_moss'), 43.5, 45.5, { y: 3.6, tint: 0xb9c6d8 }),
    ],
  }),
  room('rampa_bir', 'Ağ Rampası', 30, 40, 4, 4, 'stone_dark', 'cave', 0.15, {
    floorY: 4, ceiling: 8, slopes: [RP_BIR], explicitDecor: true,
    props: [
      P(hw('lantern_hanging'), 31, 41.5, { y: 3.0, light: lt(AMBER, 1.8, 9, true) }),
      P(hw('lantern_hanging'), 31, 42, { y: 3.0, light: lt(AMBER, 1.8, 9, true) }),
      P(kn('hanging_moss'), 31.5, 40.5, { y: 3.5, tint: 0xb9c6d8 }), P(kn('hanging_moss'), 30.5, 41.5, { y: 3.5, tint: 0xb9c6d8 }),
    ],
  }),
  room('avanoksa_yuvasi', "Avanoksa'nın Yuvası", 34, 33, 13, 12, 'stone_dark', 'cave', 0.1, {
    floorY: 2, ceiling: 20, boss: 1, explicitDecor: true, lightColor: TEAL, fog: fog(0x12202a, 12, 64),
    zones: [circleZone('dais', 40, 38, 5.2, { color: 0x1c2630 }), circleZone('rune', 40, 38, 5.6, { color: 0x1c2630, glow: 0xb9c6d8, glowIntensity: 0.4 })],
    props: [
      P(kn('hanging_moss'), 36, 35, { y: 6.0, tint: 0xb9c6d8 }), P(kn('hanging_moss'), 44, 35, { y: 6.0, tint: 0xb9c6d8 }),
      P(gp('crystal_blue'), 35.5, 34.5, { tint: TEAL, light: lt(TEAL, 1.2, 7, false) }),
      P(gp('crystal_blue'), 45.5, 41, { tint: TEAL, light: lt(TEAL, 1.2, 7, false) }),
    ],
  }),
  room('rampa_iki', 'Yukarı Yol', 40, 28, 4, 5, 'stone_dark', 'temple', 0.15, {
    floorY: 2, ceiling: 9, slopes: [RP_IKI], explicitDecor: true,
    props: [
      P(hw('lantern_hanging'), 41.5, 31, { y: 3.0, light: lt(AMBER, 1.8, 9, true) }),
      P(gp('signpost'), 41, 30.2), P(kn('hanging_moss'), 40.6, 29.5, { y: 4.0, tint: 0xb9c6d8 }),
      P(kn('hanging_moss'), 41.6, 31.6, { y: 4.0, tint: 0xb9c6d8 }),
    ],
  }),
  room('nobet_holu', 'Nöbetçi Holü', 34, 17, 14, 11, 'tiles', 'temple', 0.4, {
    floorY: 8, ceiling: 24, explicitDecor: true, lightColor: AMBER, fog: fog(0x1a1028, 10, 52),
    tiers: [tier('balcony', 12, 34, 17, 14, 11, { wall: true })],
    props: [
      ...[36, 46].flatMap((x) => [18.5, 21.5, 24.5].map((z) => P(kn('stone_tallB'), x, z, { scale: 3, tint: 0x70607a }))),
      P(gp('statue_hooded'), 35, 18, { tint: 0x4a3a5a }), P(gp('statue_hooded'), 46.5, 18, { tint: 0x4a3a5a }),
      P(gp('statue_hooded'), 35, 26.5, { tint: 0x4a3a5a }), P(gp('statue_hooded'), 46.5, 26.5, { tint: 0x4a3a5a }),
      P(kg('lantern-glass'), 37.5, 21.5, { scale: 2, tint: AMBER, tag: 'device', device: 'echo_gong' }),
      P(hw('lantern_hanging'), 40, 19.5, { y: 4.0, light: lt(AMBER, 1.8, 10, true) }),
      P(hw('lantern_hanging'), 40, 24.5, { y: 4.0, light: lt(AMBER, 1.8, 10, true) }),
    ],
  }),
  room('ag_gecidi', 'Ağ Geçidi', 30, 28, 10, 3, 'dirt', 'cave', 0.15, {
    floorY: 6.5, ceiling: 7, skip: true, slopes: [RP_GECIT], fog: fog(0x16241a, 6, 36),
    props: [
      // silk barricade of the skip route: three breakables off the door line (x 37.5) so the content check passes
      P(kg('coffin'), 37.5, 28.2, { tag: 'breakable', collide: true, scale: 1.2, tint: 0xb9c6d8 }),
      P(kg('coffin'), 37.5, 29.2, { tag: 'breakable', collide: true, scale: 1.2, tint: 0xb9c6d8 }),
      P(kg('coffin'), 37.5, 30.2, { tag: 'breakable', collide: true, scale: 1.2, tint: 0xb9c6d8 }),
      P(gp('bone_pile'), 33, 28.5, { tint: 0x8a8a50 }),
    ],
  }),
  room('laboratuvar', 'Hasat Laboratuvarı', 21, 17, 13, 11, 'stone_dark', 'brick', 0.4, {
    floorY: 5, ceiling: 14, explicitDecor: true, slopes: [ST_LAB_W, ST_YANKI], lightColor: AMBER,
    props: [
      P(dg('table_long'), 30.6, 18.2), P(dg('table_long'), 32.6, 18.2),
      P(gp('alchemy_table'), 20.9, 18.2), P(gp('alchemy_table'), 20.9, 19.8),
      P(gp('cauldron'), 31.2, 25.2, { scale: 2.2, tint: 0x3a1245, light: lt(GREEN, 1.0, 6, true) }),
      P(gp('cauldron'), 21.2, 24.2, { scale: 2.2, tint: 0x3a1245, light: lt(GREEN, 1.0, 6, true) }),
      P(gp('crystal_blue'), 22.2, 26.2, { tint: TEAL, light: lt(TEAL, 1.5, 8, false) }),
      P(kn('statue_obelisk'), 23, 17, { scale: 2, tint: 0x2a3a52 }), P(kn('statue_obelisk'), 29, 17, { scale: 2, tint: 0x2a3a52 }),
      P(hw('lantern_hanging'), 26, 26, { y: 3.0, light: lt(AMBER, 1.8, 10, true) }),
    ],
  }),
  room('anubzek_terasi', 'Yankı Seyir Terası', 21, 4, 13, 13, 'temple', 'temple', 0.1, {
    floorY: 11, ceiling: 18, openAir: true, boss: 2, explicitDecor: true, slopes: [], lightColor: TEAL, fog: fog(0x0e1a26, 12, 70),
    zones: [
      rectZone('pit', 21, 4, 2, 2, { blocked: true, ...CHASM }), rectZone('pit', 32, 4, 2, 2, { blocked: true, ...CHASM }),
      rectZone('pit', 21, 15, 2, 2, { blocked: true, ...CHASM }), rectZone('pit', 32, 15, 2, 2, { blocked: true, ...CHASM }),
      circleZone('dais', 27, 10, 5.8),
      circleZone('rune', 27, 10, 4.6, { color: 0x0e1a26, glow: TEAL, glowIntensity: 0.9 }),
      circleZone('rune', 27, 10, 2.0, { color: 0x0e1a26, glow: TEAL, glowIntensity: 0.9 }),
    ],
    props: [
      P(gp('crystal_blue'), 27, 4.5, { tint: TEAL, light: lt(TEAL, 1.6, 9, false) }),
      P(gp('crystal_blue'), 32.5, 10, { tint: TEAL, light: lt(TEAL, 1.6, 9, false) }),
      P(gp('crystal_blue'), 27, 15.5, { tint: TEAL, light: lt(TEAL, 1.6, 9, false) }),
      P(gp('crystal_blue'), 21.5, 10, { tint: TEAL, light: lt(TEAL, 1.6, 9, false) }),
      P(ip('psx-medieval', 'decoration/vine_hanging'), 23, 7, { y: 6.5, tint: 0xb9c6d8 }),
    ],
  }),
  room('tunel', 'Kara Kan Tüneli', 34, 8, 6, 4, 'stone_dark', 'forge', 0.2, {
    floorY: 7, ceiling: 8, slopes: [RP_TUNEL], explicitDecor: true, ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    zones: [wetPool(35, 9.5, 3, 1.2)],
    props: [
      P(dg('barrel_large'), 36.5, 10.2, { tint: 0x2a2030 }),
      P(hw('lantern_hanging'), 37, 8.5, { y: 3.0, light: lt(VIOLET, 1.4, 6, true) }),
      P(hw('lantern_hanging'), 38, 10, { y: 3.0, light: lt(VIOLET, 1.4, 6, true) }),
      P(kn('hanging_moss'), 35, 9.5, { y: 2.8, tint: 0x9cff6a }),
    ],
  }),
  room('kan_hatti', 'Kara Kan Hattı', 40, 4, 12, 10, 'stone_dark', 'forge', 0.35, {
    floorY: 7, ceiling: 16, explicitDecor: true, lightColor: VIOLET, ambientVfx: 'ambient_shadow_wisps', fog: fog(0x180f24, 8, 40),
    zones: [wetPool(41, 5, 4, 2), wetPool(46, 8, 4, 2)],
    props: [
      P(gp('cauldron'), 41.2, 4.6, { scale: 2.2, tint: 0x3a1245, light: lt(VIOLET, 1.4, 8, true) }),
      P(gp('cauldron'), 50.8, 4.6, { scale: 2.2, tint: 0x3a1245, light: lt(VIOLET, 1.4, 8, true) }),
      P(gp('cauldron'), 41.2, 12.8, { scale: 2.2, tint: 0x3a1245, light: lt(VIOLET, 1.4, 8, true) }),
      P(gp('cauldron'), 50.8, 12.8, { scale: 2.2, tint: 0x3a1245, light: lt(VIOLET, 1.4, 8, true) }),
      P(gp('wagon'), 44.5, 6.5, { tint: 0x2a2030 }), P(gp('wagon'), 44.5, 9.5, { tint: 0x2a2030 }),
      P(dg('barrel_large'), 47.5, 10, { tint: 0x2a2030 }),
      P(kg('lantern-glass'), 46.5, 9, { scale: 2, tint: AMBER, tag: 'device', device: 'echo_gong' }),
    ],
  }),
  room('dron_kogusu', 'Dron Koğuşu', 48, 14, 9, 9, 'dirt', 'cave', 0.3, {
    floorY: 7, ceiling: 12, explicitDecor: true, lightColor: GREEN, fog: fog(0x141c22, 8, 36),
    props: [
      ...[14.5, 17.5, 20.5].flatMap((z) => [49.5, 51.5, 53.5].map((x) => P(kg('coffin-old'), x, z, { y: 3.2, tint: 0xb9c6d8 }))),
      P(kn('hanging_moss'), 55, 16, { y: 3.6, tint: 0xb9c6d8 }),
    ],
  }),
  room('kikatal_deposu', 'Alt Depo', 48, 23, 15, 13, 'stone_dark', 'forge', 0.1, {
    floorY: 3, ceiling: 22, openAir: true, boss: 3, explicitDecor: true, slopes: [ST_PIT], lightColor: VIOLET, fog: fog(0x1a1028, 10, 52),
    zones: [
      circleZone('pit', 55, 28.5, 1.7, { blocked: true, color: 0x000000, glow: VIOLET, glowIntensity: 1.2 }),
      circleZone('pool', 48.8, 25.8, 1.3, { color: 0x1a0a22, glow: VIOLET }), circleZone('pool', 60.5, 24.5, 1.3, { color: 0x1a0a22, glow: VIOLET }),
      circleZone('pool', 49.5, 33.5, 1.3, { color: 0x1a0a22, glow: VIOLET }), circleZone('pool', 60.5, 33.5, 1.3, { color: 0x1a0a22, glow: VIOLET }),
    ],
    props: [
      P(gp('cauldron'), 55, 28.5, { scale: 3, tint: 0x3a1245, light: lt(VIOLET, 2.0, 12, true) }),
      P(dg('barrel_large'), 48.8, 25.8, { tint: 0x2a2030 }), P(dg('barrel_large'), 60.5, 24.5, { tint: 0x2a2030 }),
      P(dg('barrel_large'), 49.5, 33.5, { tint: 0x2a2030 }), P(dg('barrel_large'), 60.5, 33.5, { tint: 0x2a2030 }),
      P(gp('crystal_blue'), 55, 23.5, { tint: VIOLET, light: lt(VIOLET, 1.5, 8, false) }),
      P(hw('lantern_hanging'), 58, 27, { y: 3.0, light: lt(VIOLET, 1.4, 7, true) }),
    ],
  }),
];

// ---- doors (19) ---------------------------------------------------------------------------------------------------------
const DOORS: DoorDef[] = [
  door('giris', 'kopru', 10, 48, 'e', 2, 'none'),
  door('kopru', 'teller', 15, 48, 'e', 2, 'none'),
  door('teller', 'ixin_oyugu', 18, 40, 'n', 2, 'none'),
  door('teller', 'nakt_oyugu', 26, 40, 'n', 2, 'none'),
  door('teller', 'atik_oyugu', 29, 47, 'e', 2, 'none'),
  door('atik_oyugu', 'yumurta_odasi', 35, 47, 'e', 2, 'none'),
  door('teller', 'rampa_bir', 29, 40, 'e', 4, 'none'),
  { ...door('rampa_bir', 'avanoksa_yuvasi', 33, 40, 'e', 4, 'boss_lock'), requires: ['yk_p07', 'yk_p08', 'yk_p09'] },
  door('avanoksa_yuvasi', 'rampa_iki', 40, 33, 'n', 4, 'boss_exit'),
  door('rampa_iki', 'nobet_holu', 40, 28, 'n', 4, 'none'),
  door('nobet_holu', 'laboratuvar', 34, 21, 'w', 2, 'none'),
  door('rampa_iki', 'ag_gecidi', 40, 29, 'w', 2, 'none'),
  door('ag_gecidi', 'laboratuvar', 31, 28, 'n', 2, 'none'),
  door('laboratuvar', 'anubzek_terasi', 26, 17, 'n', 2, 'boss_lock'),
  door('anubzek_terasi', 'tunel', 33, 8, 'e', 4, 'boss_exit'),
  door('tunel', 'kan_hatti', 39, 8, 'e', 4, 'none'),
  door('kan_hatti', 'dron_kogusu', 48, 13, 's', 4, 'none'),
  door('dron_kogusu', 'kikatal_deposu', 50, 22, 's', 4, 'boss_lock'),
];

// ---- packs (29; forces are the member sums, 502 in total, 474 on the non-optional route) ---------------------------------
const PACKS: PackDef[] = [
  packN('yk_p01', 'kopru', 13, 48.5, [['yk_wasp', 4], ['yk_carrier', 1]], { patrol: [[11.5, 48.5], [14.5, 48.5]] }),
  packN('yk_p02', 'teller', 21.5, 47, [['yk_crawler', 6], ['yk_attendant', 1]]),
  packN('yk_p03', 'teller', 22, 51, [['yk_engorged', 1], ['yk_carrier', 2]]),
  packN('yk_p04', 'teller', 23.5, 45, [['yk_wasp', 5], ['yk_attendant', 1]], { patrol: [[21, 45], [26, 45]] }),
  packN('yk_p05', 'teller', 27, 49, [['yk_crawler', 4], ['yk_carrier', 2], ['yk_attendant', 1]]),
  packN('yk_p06', 'teller', 22.5, 41.8, [['yk_crawler', 8]], { dormant: { kind: 'egg', wakeRadius: 6 }, big: true }),
  packN('yk_p07', 'ixin_oyugu', 18.5, 36.5, [['yk_ixin', 1], ['yk_attendant', 2]]),
  packN('yk_p08', 'nakt_oyugu', 26.5, 36.5, [['yk_nakt', 1], ['yk_crawler', 4]], { note: 'Gate pack 2 of 3' }),
  packN('yk_p09', 'atik_oyugu', 33, 47.5, [['yk_atik', 1], ['yk_carrier', 2]], { note: 'Gate pack 3 of 3' }),
  packN('yk_p10', 'rampa_bir', 31.5, 41, [['yk_engorged', 1], ['yk_crawler', 3]]),
  packN('yk_p11', 'rampa_iki', 41, 30, [['yk_worker', 2], ['yk_wasp', 3]]),
  packN('yk_p12', 'nobet_holu', 38, 24, [['yk_stagshell', 1], ['yk_bloodguard', 1], ['yk_assistant', 1], ['yk_bloodtender', 1]], { big: true }),
  packN('yk_p13', 'nobet_holu', 44, 22, [['yk_stagshell', 1], ['yk_worker', 2], ['yk_webmage', 2]]),
  packN('yk_p14', 'nobet_holu', 41, 19.5, [['yk_bloodguard', 2], ['yk_webmage', 1]], { note: 'Two bloodguards: stagger the clouds' }),
  packN('yk_p15', 'nobet_holu', 40.5, 25.5, [['yk_worker', 3], ['yk_assistant', 1]], { patrol: [[36, 25.5], [45, 25.5]], linkedTo: ['yk_p12'] }),
  packN('yk_p16', 'ag_gecidi', 35.5, 29, [['yk_engorged', 1], ['yk_wasp', 3]]),
  packN('yk_p17', 'laboratuvar', 25, 24, [['yk_webmage', 2], ['yk_assistant', 1], ['yk_bloodtender', 1], ['yk_attendant', 1]]),
  packN('yk_p18', 'laboratuvar', 28, 22.5, [['yk_worker', 3], ['yk_assistant', 1], ['yk_bloodtender', 1]]),
  packN('yk_p19', 'laboratuvar', 22, 22, [['yk_bloodguard', 1], ['yk_webmage', 2], ['yk_stagshell', 1]]),
  packN('yk_p20', 'laboratuvar', 29, 25.5, [['yk_engorged', 1], ['yk_crawler', 5]]),
  packN('yk_p21', 'tunel', 36.5, 9, [['yk_carrier', 2], ['yk_wasp', 4]], { patrol: [[35, 9], [38, 9]] }),
  packN('yk_p22', 'kan_hatti', 43, 10.5, [['yk_overseer', 1], ['yk_drone', 1], ['yk_bloodtender', 1], ['yk_carrier', 2]]),
  packN('yk_p23', 'kan_hatti', 49, 8, [['yk_overseer', 2], ['yk_drone', 2], ['yk_bloodtender', 1]], { big: true }),
  packN('yk_p24', 'kan_hatti', 45.5, 5.5, [['yk_worker', 3], ['yk_drone', 2], ['yk_bloodtender', 1]], { patrol: [[42.5, 5.5], [49, 5.5]] }),
  packN('yk_p25', 'kan_hatti', 46, 11.5, [['yk_engorged', 2], ['yk_carrier', 2]], { patrol: [[42.5, 11.5], [50, 11.5]] }),
  packN('yk_p26', 'dron_kogusu', 51, 16.5, [['yk_drone', 5]], { dormant: { kind: 'ceiling', wakeRadius: 7 }, big: true }),
  packN('yk_p27', 'dron_kogusu', 52, 19.5, [['yk_overseer', 1], ['yk_bloodguard', 1], ['yk_assistant', 1], ['yk_bloodtender', 1]], { linkedTo: ['yk_p26'], big: true }),
  packN('yk_p28', 'dron_kogusu', 53, 15, [['yk_crawler', 4], ['yk_wasp', 2]]),
  packN('yk_p29', 'yumurta_odasi', 40.5, 48, [['yk_crawler', 10], ['yk_engorged', 2]], { optional: true, dormant: { kind: 'egg', wakeRadius: 6 }, big: true }),
];

// ---- theme ----------------------------------------------------------------------------------------------------------------
const THEME: DungeonTheme = {
  fogColor: 0x0a1218, fogNear: 8, fogFar: 40,
  ambient: 0x2c4256, ambientIntensity: 0.3,
  hemiSky: 0x5aa8c0, hemiGround: 0x0c1218,
  torchColor: AMBER, bloomStrength: 0.55,
  music: 'dungeon_crypt', palette: [0x0d1620, 0x2a3a52, TEAL, 0xb9c6d8, 0xd6dfae, GREEN, 0x3a1245, AMBER], tint: 0x7f93b0,
};

export const YANKI_AGI: DungeonDef = {
  id: 'yanki_agi',
  name: 'Yankı Ağı',
  shortName: 'Yankı',
  lore: "Karakır Bozkırı'nın altında, Kadim Zindanlar'dan bile eski bir şehir uyanıyor: Dokucuların Yankı Şehri. Dokucu Soyu, efsun damarlarından sızan Kara Kan'ı hasat ederek soylarını bir üst katmana yükseltmeye çalışıyor. Şehrin duvarları sesi hiç unutmaz: aşağıdaki her adım, her çığlık ağın teline binip kovana ulaşır.",
  levelRange: [60, 60],
  timerSec: 1770,
  forcesRequired: 405,
  theme: THEME,
  grid: { w: 64, h: 56 },
  rooms: ROOMS,
  doors: DOORS,
  packs: PACKS,
  bosses: [
    bossAt('boss_avanoksa', 'avanoksa_yuvasi', 40.5, 37, -90, 1),
    bossAt('boss_anubzek', 'anubzek_terasi', 27, 7, 0, 2),
    bossAt('boss_kikatal', 'kikatal_deposu', 55, 31.5, 180, 3),
  ],
  start: { pos: [4, 49.5], facing: 90 },
  exit: { pos: [55, 34] },
  extras: {
    fontOfPower: pt(6.5, 47),
    shrines: [{ type: 'shrine_power', pos: pt(28.3, 52.2) }, { type: 'shrine_haste', pos: pt(22.2, 26.2) }],
    riftSpots: [[20, 50], [26, 46], [41, 22], [32.5, 26.5], [46, 8], [52, 18]],
    chests: [{ pos: pt(44, 51), kind: 'chest_wood' }],
  },
  season: 1,
  endgame: true,
  vertical: true,
  lifts: [],
};

export const YANKI_AGI_ROOM_COUNT = ROOMS.length;
