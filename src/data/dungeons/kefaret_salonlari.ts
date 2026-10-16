import type { DecorTier, DoorDef, DungeonDef, DungeonTheme, PackDef, PropPlacement, RoomDef, SlopeDef, TileRect, ZoneDef } from '../../types/dungeons';
import '../enemies_kefaret_salonlari';
import type { PackExtra } from './kit';
import { chandelier, circleZone, door, gp, lt, pack, pt, rectZone, room, stairs } from './kit';
import { makeRescale, remapRoomGeometry, type Rect4 } from './rescale';

/**
 * KEFARET SALONLARI (kefaret_salonlari), Season 1 Mythic+ dungeon. Design: docs/dungeons/kefaret_salonlari.md (sections 3.2 to
 * 3.4 for the rooms, heights, doors and critical path, 4.3 for the packs, 5 for the bosses, 6 for the timer and forces).
 * Heights follow ENGINE_VERTICALITY (vertical: true): seven levels from 0.0 to 14.4 m, nine stair strips, the Lament bridge
 * over a fall zone (k_kuzey), a pit rim on the Ekelon terrace. No ramps and no lifts.
 *
 * NOT YET REGISTERED: this file is not in dungeons/index.ts. Registration lines are listed in the report.
 * Deviations from the design, all for the content-check forces band (115 to 130 %) and the engine today:
 *  - forcesRequired is 340 (design 380) and the timer 29:35 (design 29:00), so the mandatory route (route A, 393) is 115.6 %
 *    and every non-optional pack (route A plus the servants' passage, 417) is 122.6 %. Design totals (493 forces) would be
 *    145 % of 340: the optional Archive keeps one pack (20 forces) and the Pişmanlık crypt has no pack (its 36 forces are cut).
 *  - Kibir spawns use `extras.riftSpots` only (no kibirSpots field in the types yet). No `kibirCanon`.
 *  - The Ekelon door is an ordinary boss_lock door (no DoorDef.model, no `gothic_door` prop, no `pull: 'interact'`).
 *  - No Blender props yet: sinstone, statue, bell, vessel, rose window and gate props use existing stand-ins (crystal_purple,
 *    statue_hooded, rock_cliff, chandelier). No Halkor awakening primitive: the boss script holds Halkor until three shards die.
 *  - No checkpoint or NPC data beyond one M+ release checkpoint in the Alyez nave.
 * OWNER: content module.
 */

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const P = (model: string, x: number, z: number, o: Partial<Omit<PropPlacement, 'model' | 'pos'>> = {}): PropPlacement => ({ model, pos: [x, z], ...o });
const tier = (kind: DecorTier['kind'], y: number, x: number, z: number, w: number, h: number, extra: Partial<DecorTier> = {}): DecorTier => ({
  kind, y, rect: rect(x, z, w, h), ...extra,
});
const fog = (color: number, near: number, far: number) => ({ color, near, far });

/** Design spiral (tile offsets from the pack centre; melee first, casters last). Keeps members off the walls. */
const SPIRAL: [number, number][] = [
  [0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53],
  [-0.28, 1.03], [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.58, -1.23], [0.43, 1.36],
];
/** Pack of `counts` [enemyId, n] pairs on the spiral (the list order is the spiral order: melee first, casters last). */
function packS(id: string, roomId: string, cx: number, cz: number, counts: [string, number][], extra: PackExtra = {}): PackDef {
  const ids = counts.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  if (ids.length > SPIRAL.length) throw new Error(`[kefaret_salonlari] pack ${id}: ${ids.length} members, spiral holds ${SPIRAL.length}`);
  return pack(id, roomId, cx, cz, undefined, ids.map((enemyId, i) => [enemyId, SPIRAL[i][0], SPIRAL[i][1]] as [string, number, number]), extra);
}

const RED = 0xc8382f, MOON = 0x8890c0;
const sinRune = (x: number, z: number, r: number, gi = 0.9): ZoneDef => circleZone('rune', x, z, r, { color: 0x1d1826, glow: RED, glowIntensity: gi });

// ---- slopes (stairs: axis is the direction of the run; yFrom at the MIN edge on axis, yTo at the MAX edge) -------------------
const S1: SlopeDef = stairs(rect(30, 54, 4, 2), 'z', 2.4, 0.0, { id: 'S1' });          // giris to narteks, high end north
const S2: SlopeDef = stairs(rect(14, 38, 2, 10), 'x', 0.0, 2.4, { id: 'S2' });         // galeri crypt stair, high end east
const S3: SlopeDef = stairs(rect(40, 38, 8, 2), 'z', 4.2, 2.4, { id: 'S3' });          // galeri to north chamber, high end north
const S4: SlopeDef = stairs(rect(28, 38, 8, 2), 'z', 0.6, 2.4, { id: 'S4' });          // descent into the Halkor rotunda, high end south
const S5: SlopeDef = stairs(rect(49, 48, 4, 3), 'z', 2.4, 0.0, { id: 'S5' });          // dogu to archive cellar, high end north
const S6: SlopeDef = stairs(rect(20, 28, 4, 6), 'x', 3.6, 0.6, { id: 'S6' });          // climb out of the pit, high end west
const S7: SlopeDef = stairs(rect(0, 12, 16, 4), 'z', 8.4, 3.6, { id: 'S7' });          // Gozcu stair hall, high end north
const S8: SlopeDef = stairs(rect(24, 8, 6, 4), 'z', 8.4, 3.6, { id: 'S8' });           // descent below the bridge, high end north
const S9: SlopeDef = stairs(rect(48, 15, 16, 7), 'z', 8.4, 14.4, { id: 'S9' });        // grand staircase, high end south

// ---- void around the Lament bridge (fall = open, depth 8 m; a fall costs 25 % max HP, respawn on the last safe tile) ----
const VOID = { fall: 'open', depth: 8, color: 0x0a0610, glow: RED, glowIntensity: 0.5 } as const;

// ---- rooms (18) --------------------------------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  room('giris', 'Kefaret Avlusu', 24, 54, 16, 8, 'stone', 'stone', 0.3, {
    floorY: 0, ceiling: 20, openAir: true, ambientVfx: 'ambient_dust', lightColor: 0x8a90c8, fog: fog(0x2a2038, 14, 62),
    slopes: [S1],
    zones: [sinRune(31.5, 56.4, 1.0, 0.4)],
    props: [
      P(gp('font_of_power'), 31.5, 56.4, { y: 0, tint: 0xd8c0ff, light: lt(0xb070ff, 1.4, 8, false) }),
      P(gp('brazier'), 26, 56, { light: lt(RED, 2.0, 10) }), P(gp('brazier'), 37, 56, { light: lt(RED, 2.0, 10) }),
      P(gp('lamp_post'), 25, 60, { light: lt(0xffb070, 1.2, 9, false) }), P(gp('lamp_post'), 38, 60, { light: lt(0xffb070, 1.2, 9, false) }),
    ],
  }),

  room('narteks', 'Günah Nefi', 24, 45, 16, 9, 'tiles', 'temple', 0.2, {
    floorY: 2.4, ceiling: 14, lightColor: 0xffb070,
    props: [
      ...chandelier(31.5, 50.5, 11, { color: 0xffb070 }),
      P(gp('brazier'), 28.5, 52.5, { light: lt(0xffb070, 1.2, 7) }), P(gp('brazier'), 34.5, 52.5, { light: lt(0xffb070, 1.2, 7) }),
      P(gp('altar'), 31.5, 48.8, { tint: 0x8e1b24 }),
    ],
  }),

  room('tas_galerisi', 'Günah Taşı Galerisi', 16, 36, 32, 9, 'stone_dark', 'temple', 0.25, {
    floorY: 2.4, ceiling: 20, lightColor: 0xd08a70,
    tiers: [tier('windows', 12, 16, 40, 32, 8, { count: 8, spacing: 4 })],
    zones: [sinRune(31.5, 43.5, 1.2, 0.5)],
    props: [
      ...chandelier(24.5, 43.5, 15, { color: 0xd08a70 }), ...chandelier(42, 43.5, 15, { color: 0xd08a70 }),
      P(gp('statue_hooded'), 20, 41.5, { scale: 1.2, tint: 0x6a6878 }), P(gp('statue_hooded'), 44, 41.5, { scale: 1.2, tint: 0x6a6878 }),
      P(gp('crystal_purple'), 27, 41.5, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.8 }),
      P(gp('crystal_purple'), 36, 41.5, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.8 }),
    ],
  }),

  room('kiymik_bati', 'Batı Mühür Odası', 7, 36, 9, 10, 'stone_dark', 'stone', 0.3, {
    floorY: 0, ceiling: 10, lightColor: RED, slopes: [S2],
    props: [
      P(gp('crystal_purple'), 8, 39, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.9, light: lt(RED, 1.8, 9) }),
      P(gp('brazier'), 8, 46, { light: lt(RED, 1.2, 7) }),
    ],
  }),

  room('kiymik_dogu', 'Doğu Mühür Odası', 48, 36, 9, 10, 'stone_dark', 'stone', 0.3, {
    floorY: 2.4, ceiling: 10, lightColor: RED,
    props: [
      P(gp('crystal_purple'), 55, 39, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.9, light: lt(RED, 1.8, 9) }),
      P(gp('brazier'), 49, 46, { light: lt(RED, 1.2, 7) }),
    ],
  }),

  room('kiymik_kuzey', 'Kuzey Mühür Odası', 39, 26, 9, 10, 'stone_dark', 'stone', 0.3, {
    floorY: 4.2, ceiling: 10, lightColor: RED, slopes: [S3],
    props: [
      P(gp('crystal_purple'), 46, 31, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.9, light: lt(RED, 1.8, 9) }),
      P(gp('brazier'), 41, 31, { light: lt(RED, 1.2, 7) }),
    ],
  }),

  room('halkor_cemberi', 'Halkor Çemberi', 24, 22, 15, 14, 'stone_dark', 'temple', 0.12, {
    boss: 1, explicitDecor: true, floorY: 0.6, ceiling: 24, lightColor: RED, slopes: [S4],
    // the glowing ring r 21 to 22 m (outer rune disc, inner dais disc on top: later zones override earlier ones)
    zones: [circleZone('rune', 31.5, 32.5, 5.6, { color: 0x2a1020, glow: RED, glowIntensity: 0.9 }), circleZone('dais', 31.5, 32.5, 5.3, { color: 0x1d1826 })],
    tiers: [tier('ring', 16, 24, 26, 16, 14, { depth: 3 })],
    props: [
      P(gp('rock_cliff'), 31.5, 32.5, { tint: 0x3a3048, y: 0.6, scale: 1.4 }),
      P(gp('crystal_purple'), 25.5, 28, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.9 }),
      P(gp('crystal_purple'), 37.5, 28, { tint: 0x1d1826, emissive: RED, emissiveIntensity: 0.9 }),
      ...chandelier(31.5, 28.5, 18, { color: RED }),
    ],
  }),

  room('arsiv', 'Günah Taşı Arşivi', 48, 46, 9, 9, 'stone_dark', 'brick', 0.5, {
    optional: true, floorY: 0, ceiling: 8, lightColor: 0xffc080, slopes: [S5],
    props: [P(gp('bone_pile'), 55, 52, { tint: 0x8a8a50 }), P(gp('brazier'), 55, 49, { light: lt(0xffc080, 1.0, 6) })],
  }),

  room('k_bati', 'Batı Kolonadı', 4, 27, 20, 9, 'tiles', 'temple', 0.3, {
    floorY: 3.6, ceiling: 12, lightColor: 0xffb070, slopes: [S6],
    props: [P(gp('brazier'), 5, 29, { light: lt(0xffb070, 1.2, 7) }), P(gp('brazier'), 5, 32.5, { light: lt(0xffb070, 1.2, 7) })],
  }),

  room('gargoyle_avlusu', 'Gargoyle Avlusu', 4, 16, 20, 11, 'stone', 'stone', 0.4, {
    floorY: 3.6, ceiling: 20, openAir: true, ambientVfx: 'ambient_dust', lightColor: 0x9a9ac8, fog: fog(0x30242e, 14, 64),
    zones: [circleZone('pool', 8, 24, 1.5, { color: 0x3e3a22 }), circleZone('pool', 15.5, 25.5, 1.2, { color: 0x3e3a22 })],
    props: [
      P(gp('lamp_post'), 4.6, 16.4, { light: lt(0xffb070, 1.2, 9, false) }), P(gp('lamp_post'), 21, 26, { light: lt(0xffb070, 1.2, 9, false) }),
    ],
  }),

  room('servis_gecidi', 'Hizmetkâr Geçidi', 0, 16, 4, 18, 'dirt', 'brick', 0.5, {
    skip: true, floorY: 3.6, ceiling: 8, lightColor: 0xe0a060,
    props: [P(gp('lamp_post'), 2, 24, { light: lt(0xe0a060, 1.0, 6) })],
  }),

  room('k_ekelon', 'Gözcü Merdivenleri', 0, 12, 16, 4, 'stone', 'temple', 0.25, {
    floorY: 3.6, ceiling: 16, lightColor: 0xffb070, slopes: [S7],
    props: [P(gp('brazier'), 1.5, 12.5, { light: lt(0xffb070, 1.6, 9) }), P(gp('brazier'), 14.5, 13.5, { light: lt(0xffb070, 1.6, 9) })],
  }),

  room('ekelon_terasi', 'Gözcü Terası', 0, 0, 24, 12, 'stone', 'stone', 0.12, {
    boss: 2, explicitDecor: true, floorY: 8.4, ceiling: 20, openAir: true, lightColor: 0x8890b8, fog: fog(0x3a1c2c, 16, 70),
    zones: [rectZone('pit', 0, 0, 24, 2, { blocked: true, color: 0x120810, glow: RED, glowIntensity: 0.6, light: lt(RED, 1.6, 14, true, 0.5) })],
    props: [P(gp('brazier'), 20, 8, { light: lt(RED, 1.6, 9) }), P(gp('brazier'), 4, 8, { light: lt(RED, 1.6, 9) })],
  }),

  room('k_kuzey', 'Ağıt Köprüsü', 24, 0, 6, 8, 'stone_dark', 'temple', 0.3, {
    floorY: 8.4, ceiling: 20, openAir: true, ambientVfx: 'ambient_embers', lightColor: MOON,
    // T-shaped span (hand placed in the new coordinates, not remapped): the main span is rows z 2 to 5 (x 24 to 29), the branch
    // is x 25 to 28 at rows z 6 and 7 (the door to the Pismanlik crypt is on its north row)
    zones: [
      rectZone('void', 24, 0, 6, 2, VOID), rectZone('void', 24, 6, 1, 2, VOID), rectZone('void', 29, 6, 1, 2, VOID),
    ],
    props: [P(gp('chains_hanging'), 24.5, 3, { y: 4 }), P(gp('chains_hanging'), 29, 5, { y: 4 })],
  }),

  room('pismanlik_mahzeni', 'Pişmanlık Mahzeni', 24, 8, 6, 10, 'stone_dark', 'stone', 0.5, {
    optional: true, floorY: 3.6, ceiling: 8, lightColor: 0xb8b0e0, ambientVfx: 'ambient_shadow_wisps', slopes: [S8],
    props: [P(gp('bone_pile'), 28, 15, { tint: 0x8a8a50 }), P(gp('brazier'), 25, 16, { light: lt(0xb8b0e0, 1.0, 6) })],
  }),

  room('cemaat_nefi', 'Cemaat Nefi', 30, 0, 20, 14, 'tiles', 'temple', 0.12, {
    boss: 3, explicitDecor: true, floorY: 8.4, ceiling: 30, lightColor: 0xffd090, ambientVfx: 'ambient_dust',
    tiers: [tier('windows', 20, 30, 0, 20, 14, { count: 6, spacing: 4 })],
    props: [
      ...chandelier(36, 6.5, 22, { color: 0xffd090 }), ...chandelier(44, 6.5, 22, { color: 0xffd090 }),
      P(gp('altar'), 48, 3, { tint: 0x8e1b24 }), P(gp('statue_hooded'), 31.5, 2, { tint: 0x6a6878 }),
    ],
  }),

  room('kefaret_merdiveni', 'Kefaret Merdiveni', 46, 14, 16, 9, 'tiles', 'temple', 0.25, {
    floorY: 8.4, ceiling: 22, lightColor: 0xffb070, slopes: [S9],
    props: [...chandelier(52, 18, 16, { color: 0xffb070 }), ...chandelier(60, 18, 16, { color: 0xffb070 })],
  }),

  room('kamarar_salonu', 'Kamarar Salonu', 48, 23, 16, 12, 'tiles', 'temple', 0.1, {
    boss: 4, explicitDecor: true, floorY: 14.4, ceiling: 30, lightColor: RED,
    zones: [
      sinRune(55.5, 29.5, 4.2), circleZone('dais', 55.5, 29.5, 1.6, { color: 0x2a1020, y: 0.4 }),
      sinRune(50.5, 24.5, 1.1), sinRune(60.5, 24.5, 1.1), sinRune(50.5, 34.5, 1.1), sinRune(60.5, 34.5, 1.1),
    ],
    tiers: [tier('windows', 24, 48, 22, 16, 16, { count: 4, spacing: 4 })],
    props: [
      P(gp('statue_hooded'), 50.5, 24.5, { scale: 1.3, tint: 0x6a6878 }), P(gp('statue_hooded'), 60.5, 24.5, { scale: 1.3, tint: 0x6a6878 }),
      P(gp('statue_hooded'), 50.5, 34.5, { scale: 1.3, tint: 0x6a6878 }), P(gp('statue_hooded'), 60.5, 34.5, { scale: 1.3, tint: 0x6a6878 }),
      ...chandelier(55.5, 36, 20, { color: RED }),
    ],
  }),
];

// ---- doors (18) ------------------------------------------------------------------------------------------------------------
const DOORS: DoorDef[] = [
  door('giris', 'narteks', 30, 54, 'n', 4, 'none'),
  door('narteks', 'tas_galerisi', 30, 45, 'n', 4, 'none'),
  door('tas_galerisi', 'kiymik_bati', 16, 39, 'w', 2, 'none'),
  door('tas_galerisi', 'kiymik_dogu', 47, 39, 'e', 2, 'none'),
  door('tas_galerisi', 'kiymik_kuzey', 42, 36, 'n', 2, 'none'),
  door('tas_galerisi', 'halkor_cemberi', 30, 36, 'n', 4, 'boss_lock'),
  door('kiymik_dogu', 'arsiv', 50, 45, 's', 2, 'none'),
  door('halkor_cemberi', 'k_bati', 24, 29, 'w', 4, 'boss_exit'),
  door('k_bati', 'gargoyle_avlusu', 16, 27, 'n', 4, 'none'),
  door('k_bati', 'servis_gecidi', 4, 30, 'w', 2, 'none'),
  door('gargoyle_avlusu', 'k_ekelon', 8, 16, 'n', 4, 'none'),
  door('servis_gecidi', 'k_ekelon', 1, 16, 'n', 2, 'none'),
  door('k_ekelon', 'ekelon_terasi', 6, 12, 'n', 4, 'boss_lock'),
  door('ekelon_terasi', 'k_kuzey', 23, 2, 'e', 4, 'boss_exit'),
  door('k_kuzey', 'pismanlik_mahzeni', 25, 7, 's', 4, 'none'),
  door('k_kuzey', 'cemaat_nefi', 29, 2, 'e', 4, 'boss_lock'),
  door('cemaat_nefi', 'kefaret_merdiveni', 46, 13, 's', 4, 'boss_exit'),
  door('kefaret_merdiveni', 'kamarar_salonu', 52, 22, 's', 4, 'boss_lock'),
];

// ---- packs: route A 393 forces (the mandatory route), servants' passage 24, Archive 20 (optional) ------------------------
const PACKS_RAW: PackDef[] = [
  // narthex and gallery
  packS('k_p01', 'narteks', 30.5, 51.5, [['kef_darkblade', 2], ['kef_tazici', 1]]),
  packS('k_p02', 'narteks', 33.5, 49.3, [['kef_gargon', 3], ['kef_tazici', 1]]),
  packS('k_p03', 'tas_galerisi', 21, 43.5, [['kef_kiyici', 2]], { dormant: { kind: 'statue', wakeRadius: 7 }, big: true }),
  packS('k_p04', 'tas_galerisi', 37, 43.5, [['kef_darkblade', 1], ['kef_obliterator', 1], ['kef_toplayici', 1]]),
  packS('k_p05', 'tas_galerisi', 28.5, 44, [['kef_parcalayici', 1], ['kef_kemirgen', 4]], { patrol: [[22, 45], [41, 45]] }),
  // shard chambers (the shard is HP x4; Halkor wakes when all three die)
  packS('w_p06', 'kiymik_bati', 11, 42, [['kef_shard', 1], ['kef_obliterator', 1], ['kef_toplayici', 1]]),
  packS('w_p07', 'kiymik_bati', 10, 45.5, [['kef_gargon', 2]]),
  packS('e_p08', 'kiymik_dogu', 52, 42, [['kef_shard', 1], ['kef_obliterator', 1], ['kef_toplayici', 1]]),
  packS('e_p09', 'kiymik_dogu', 52, 45.5, [['kef_kemirgen', 3]]),
  packS('n_p10', 'kiymik_kuzey', 43.5, 33, [['kef_shard', 1], ['kef_obliterator', 1], ['kef_toplayici', 1]]),
  packS('n_p11', 'kiymik_kuzey', 43.5, 36.5, [['kef_gargon', 2]]),
  // colonnade
  packS('b_p12', 'k_bati', 12, 30.5, [['kef_darkblade', 2], ['kef_rahip', 1]]),
  packS('b_p13', 'k_bati', 19, 31, [['kef_yagmaci', 1], ['kef_kiyici', 1]]),
  // courtyard (99 forces)
  packS('c_p14', 'gargoyle_avlusu', 8, 24, [['kef_bahcivan', 2], ['kef_kemirgen', 3]]),
  packS('c_p15', 'gargoyle_avlusu', 15, 24.5, [['kef_gargon', 3], ['kef_tazici', 1], ['kef_rahip', 1]]),
  packS('c_p16', 'gargoyle_avlusu', 20, 21, [['kef_parcalayici', 2], ['kef_kemirgen', 2]]),
  packS('c_p17', 'gargoyle_avlusu', 11, 20.5, [['kef_yagmaci', 1], ['kef_kiyici', 2]], { dormant: { kind: 'statue', wakeRadius: 7 }, big: true }),
  packS('c_p18', 'gargoyle_avlusu', 6, 18.5, [['kef_darkblade', 2], ['kef_obliterator', 1], ['kef_toplayici', 1]], { big: true }),
  packS('c_p19', 'gargoyle_avlusu', 17, 17.5, [['kef_darkblade', 2], ['kef_kemirgen', 1]], { patrol: [[17, 17.5], [17, 25]] }),
  // Gozcu stair hall
  packS('e_p20', 'k_ekelon', 4, 13.5, [['kef_darkblade', 1], ['kef_tazici', 1], ['kef_rahip', 1]]),
  packS('e_p21', 'k_ekelon', 12, 13.5, [['kef_parcalayici', 1], ['kef_kemirgen', 2]]),
  // Lament bridge: explicit members on walkable span / branch tiles, no knockbacks
  pack('a_p22', 'k_kuzey', 27, 4, undefined, [['kef_darkblade', 0, 0], ['kef_obliterator', -1.1, 0], ['kef_toplayici', 1.1, 0]]),
  pack('a_p23', 'k_kuzey', 26, 6.4, undefined, [['kef_rahip', 0, -0.3], ['kef_gargon', -0.9, 0.4], ['kef_gargon', 0.9, 0.4], ['kef_gargon', 0, 0.6]]),
  // grand staircase
  packS('m_p24', 'kefaret_merdiveni', 52, 16.5, [['kef_sigar', 1], ['kef_tormented', 3], ['kef_obliterator', 1]]),
  packS('m_p25', 'kefaret_merdiveni', 58, 16.5, [['kef_yagmaci', 1], ['kef_kiyici', 1], ['kef_rahip', 1]]),
  packS('m_p26', 'kefaret_merdiveni', 53, 19.5, [['kef_gargon', 3], ['kef_tazici', 1], ['kef_rahip', 1]]),
  packS('m_p27', 'kefaret_merdiveni', 60, 19.5, [['kef_sigar', 1], ['kef_tormented', 3], ['kef_toplayici', 1]]),
  packS('m_p28', 'kefaret_merdiveni', 56, 16, [['kef_darkblade', 2], ['kef_tazici', 1], ['kef_gargon', 1]], { patrol: [[50, 16], [61, 16]] }),
  // servants' passage (route B, 24 forces)
  packS('s_p33', 'servis_gecidi', 1.5, 29, [['kef_darkblade', 3]]),
  packS('s_p34', 'servis_gecidi', 1.5, 21, [['kef_tazici', 1], ['kef_gargon', 1], ['kef_kemirgen', 2]]),
  // Archive (optional, 20 forces; the design had a second pack and the Pişmanlık crypt packs were cut for the forces band)
  packS('o_p29', 'arsiv', 51, 51.2, [['kef_obliterator', 2], ['kef_toplayici', 2]], { optional: true }),
];

// ---- scale pass ----------------------------------------------------------------------------------------------------------------
// The hand placed props, zones, stairs, tiers, packs, bosses and extras are written in the OLD layout (OLD_RECT) and remapped per
// room (rescale.ts). Exempt: the bridge room k_kuzey and its two pack centres, which are written in the new coordinates.
const OLD_RECT: Record<string, Rect4> = {
  giris: [24, 54, 16, 8], narteks: [28, 48, 8, 6], tas_galerisi: [16, 40, 32, 8], kiymik_bati: [7, 38, 9, 10],
  kiymik_dogu: [48, 38, 9, 10], kiymik_kuzey: [40, 30, 8, 10], halkor_cemberi: [24, 26, 16, 14], arsiv: [48, 48, 9, 6],
  k_bati: [4, 28, 20, 6], gargoyle_avlusu: [4, 16, 20, 12], servis_gecidi: [0, 16, 4, 18], k_ekelon: [0, 12, 16, 4],
  ekelon_terasi: [0, 0, 24, 12], k_kuzey: [24, 2, 6, 6], pismanlik_mahzeni: [24, 8, 6, 10], cemaat_nefi: [30, 0, 20, 14],
  kefaret_merdiveni: [48, 14, 16, 8], kamarar_salonu: [48, 22, 16, 16],
};
const EXEMPT_ROOMS = new Set<string>(['k_kuzey']);
const EXEMPT_PACKS = new Set<string>(['a_p22', 'a_p23']);
const R = makeRescale({
  seed: 'kefaret_salonlari', oldRect: OLD_RECT, rooms: ROOMS, doors: DOORS, packsRaw: PACKS_RAW,
  anchors: [
    { x: 31.5, z: 59, r: 2.0 }, { x: 31.5, z: 56.4, r: 1.6 }, { x: 55.5, z: 35.5, r: 2.8 },
    { x: 31.5, z: 32.5, r: 5.0 }, { x: 11.5, z: 4, r: 4.5 }, { x: 42, z: 6.5, r: 4.5 }, { x: 55.5, z: 29.5, r: 4.5 },
    { x: 22, z: 17, r: 1.5 }, { x: 40.5, z: 11.5, r: 1.5 },
  ],
});
const ROOMS_R: RoomDef[] = ROOMS.map((r) => (EXEMPT_ROOMS.has(r.id) ? r : remapRoomGeometry(R, r)));
const PACKS: PackDef[] = PACKS_RAW.map((p, i) => (EXEMPT_PACKS.has(p.id) ? p : R.packs[i]));
const at2 = R.at2;

// ---- dungeon ----------------------------------------------------------------------------------------------------------------
const THEME: DungeonTheme = {
  fogColor: 0x1d1626, fogNear: 9, fogFar: 42,
  ambient: 0x4a3f58, ambientIntensity: 0.42,
  hemiSky: 0x6e7fa8, hemiGround: 0x2a1418,
  torchColor: 0xffa86a, bloomStrength: 0.45,
  music: 'dungeon_shadow', palette: [0x1d1826, 0x4e4b55, 0x8e1b24, 0xc8382f, 0xc9a24a, 0xd7cdba], tint: 0xcdbfd0,
};

export const KEFARET_SALONLARI: DungeonDef = {
  id: 'kefaret_salonlari',
  name: 'Kefaret Salonları',
  shortName: 'Kefaret',
  lore: "Kadim Diyar'ın kızıl tepelerinde, Kefaret Salonları yüzyıllarca kibirli ruhları arındırmak için kullanıldı: yargılanan ruhlar Günah Taşları'na mühürlenir, tövbe edenler Kefaret Kapları'ndan yeniden doğardı. Ta ki Baş Kamarar Velkaan salonları ele geçirip ruhları arındırmak yerine kibirlerini hasat edene kadar. Şimdi taşlar canlanıyor, bekçiler taşlaşıyor ve Kadim Anahtar Taşı bu karanlık katedralin kapısını açıyor.",
  levelRange: [60, 60],
  timerSec: 1775,
  forcesRequired: 340,
  theme: THEME,
  grid: { w: 64, h: 64 },
  rooms: ROOMS_R,
  doors: DOORS,
  packs: PACKS,
  bosses: [
    R.bossAtNew('boss_halkor', 'halkor_cemberi', 31.5, 32.5, 0, 1),
    R.bossAtNew('boss_ekelon', 'ekelon_terasi', 11.5, 4, 0, 2),
    R.bossAtNew('boss_alyez', 'cemaat_nefi', 42, 6.5, -90, 3),
    R.bossAtNew('boss_velkaan', 'kamarar_salonu', 55.5, 29.5, 180, 4),
  ],
  start: { pos: at2(31.5, 59), facing: 180 },
  exit: { pos: at2(55.5, 35.5) },
  extras: {
    fontOfPower: pt(...at2(31.5, 56.4)),
    shrines: [{ type: 'shrine_haste', pos: pt(...at2(22, 17)) }, { type: 'shrine_power', pos: pt(...at2(40.5, 11.5)) }],
    // Efsunlu Yarik rift spots (at least 15 m from the party, nearest reachable spot): the Kibirli guardian spawns here
    riftSpots: ([[18, 44], [44.5, 45.5], [10, 31.5], [6.5, 25.5], [27, 11.2], [62, 14.5]] as [number, number][]).map(([x, z]) => pt(...at2(x, z))),
    chests: [{ pos: pt(...at2(28.2, 52.8)), kind: 'chest_wood' }, { pos: pt(...at2(55.6, 49.2)), kind: 'chest_gold' }],
    checkpoints: [pt(...at2(33, 9))],
  },
  season: 1,
  endgame: true,
  vertical: true,
  lifts: [],
};

export const KEFARET_SALONLARI_ROOM_COUNT = ROOMS.length;
