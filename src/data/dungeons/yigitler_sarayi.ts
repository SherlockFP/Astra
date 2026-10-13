import type { DoorDef, DungeonDef, DungeonSkyDef, DungeonTheme, HazardDef, HeightArea, PackDef, PropPlacement, RoomDef, TileRect } from '../../types/dungeons';
import '../enemies_yigitler_sarayi';
import type { PackExtra, PO } from './kit';
import { banner, bossAt, door, dg, gp, kg, kn, lt, pack, pt, ramp, room, shPt, stairs } from './kit';

/**
 * YIGITLER SARAYI (yigitler_sarayi), Season 1 Mythic+ dungeon 1 of 8, modelled on Halls of Valor. Design: docs/dungeons/
 * yigitler_sarayi.md (sections 3, 4, 6 and Appendix A). Real type fields are used throughout: `openAir` (open-air rooms,
 * SP-1), `floorY` / `ceiling` / `heightAreas` / `slopes` (verticality, SP-10), `storm` and `HazardDef.groundedBy` (SP-2),
 * `PropPlacement.onBreak` (SP-13). Heights are absolute metres; a slope's yFrom is at the MIN edge of its axis.
 *
 * NOT YET REGISTERED: this file is not in dungeons/index.ts (registration lines are in the orchestrator report).
 * Known gaps against the design: the Blender props (valor_* assets, odyn_titan) fall back to existing models, the Kadim
 * Diyar entrance is not placed, the sky panoramas are the existing itch cloudy skies, the Aegis pedestal and rune-pad
 * mechanic live in the boss script (see ai/bosses/yigitler_sarayi.ts), and the 1,200-prop dressing pass of section 2.10 is
 * only the set pieces below.
 */

const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });
const P = (model: string, x: number, z: number, o: PO = {}): PropPlacement => ({ model, pos: [x, z], ...o });
const area = (id: string, x: number, z: number, w: number, h: number, y: number, rim: HeightArea['rim'] = 'none'): HeightArea => ({
  id, rect: rect(x, z, w, h), y, rim,
});

// ---- skies, storm and hazards ------------------------------------------------------------------------------------------------
const SKY_STORM: DungeonSkyDef = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-24.jpg' };
const SKY_DUSK: DungeonSkyDef = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-09.jpg' };
const SKY_FIELD: DungeonSkyDef = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-21.jpg' };
const SKY_GLORY: DungeonSkyDef = { image: '/assets/sky/itch/cloudy-skyboxes-panorama/cloudy-sky-02.jpg' };
const STORM = { every: [7, 16] as [number, number], color: 0xeaf2ff, strength: 0.9 };

/** SET-1 / SET-15: lightning strikes on a random tile; a strike within 6 m of a grounding rod is cancelled and nearby players gain `rod_charged`. */
const STRIKE = (interval: number, radius: number, rods: [number, number][]): HazardDef => ({
  kind: 'lightning_strike', interval, warn: 1.4, radius, coef: 0.35, stun: 1.0, vfx: 'lightning_strike',
  groundedBy: { pos: rods, radius: 6, status: 'rod_charged' },
});

// Grounding rods (SET-15): the same numbers go into the rod props below.
const RODS_COURT: [number, number][] = [[4.5, 47.5], [16.5, 47.5], [4.5, 52.5], [16.5, 52.5]];
const RODS_WAY: [number, number][] = [[50.2, 37], [52.8, 31], [50.2, 26]];
const RODS_GATE: [number, number][] = [[46.5, 21.0], [56.5, 21.0]];

// ---- rooms (16) ----------------------------------------------------------------------------------------------------------------
const OPEN_WALL = 'parapet' as const;

const ROOMS: RoomDef[] = [
  room('giris', 'Gök Kapısı Eşiği', 7, 54, 8, 5, 'stone_dark', OPEN_WALL, 0.3, {
    openAir: true, sky: SKY_DUSK, storm: STORM, floorY: 0, ceiling: 30, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust',
  }),
  room('yuksek_kapi', 'Yüksek Kapı Avlusu', 3, 40, 16, 14, 'stone_dark', OPEN_WALL, 0.5, {
    openAir: true, sky: SKY_DUSK, storm: STORM, floorY: 0, ceiling: 30, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust',
    // terrace z 40..42 at 2.0 (the grand stair strip x 7..12, z 43..45 climbs from 0.0 at the south to 2.0 at the north)
    heightAreas: [area('terrace', 3, 40, 16, 3, 2.0, 'ledge')],
    slopes: [stairs(rect(7, 43, 6, 3), 'z', 2.0, 0.0, { id: 'yk_buyuk_merdiven' })],
    hazards: [STRIKE(9, 2.2, RODS_COURT)],
  }),
  room('k_heymdal', 'Boru Merdiveni', 9, 36, 4, 4, 'stone_dark', OPEN_WALL, 0.3, {
    openAir: true, sky: SKY_DUSK, storm: STORM, floorY: 2.0, ceiling: 30, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust',
    slopes: [stairs(rect(9, 36, 4, 4), 'z', 4.0, 2.0, { id: 'kh_boru' })],
  }),
  room('heymdal_zirvesi', 'Heymdal Zirvesi', 2, 22, 16, 14, 'stone', OPEN_WALL, 0.15, {
    boss: 1, openAir: true, sky: SKY_STORM, storm: STORM, floorY: 4.0, ceiling: 30, explicitDecor: true,
    lightColor: 0xaec4ff, ambientVfx: 'ambient_dust', fog: { color: 0x48566e, near: 18, far: 80 },
    heightAreas: [area('dais', 4, 24, 12, 10, 4.4, 'none')],
  }),
  room('solen_ocagi', 'Şölen Ocağı', 18, 26, 22, 9, 'wood', 'brick', 0.45, {
    floorY: 3.2, ceiling: 14, lightColor: 0xffa850, ambientVfx: 'ambient_embers', fog: { color: 0x2e2218, near: 10, far: 44 },
    // door ramp x 18..19 (4.0 at the west edge down to 3.2) and the High Table stair x 37 up to the dais x 38..39 at 4.1
    slopes: [
      ramp(rect(18, 29, 2, 2), 'x', 4.0, 3.2, { id: 'so_kapi_rampasi' }),
      stairs(rect(37, 27, 1, 6), 'x', 3.2, 4.1, { id: 'so_yuksek_masa' }),
    ],
    heightAreas: [area('high_table', 38, 27, 2, 6, 4.1, 'none')],
  }),
  room('bal_mahzeni', 'Bal Mahzeni', 40, 28, 6, 5, 'dirt', 'brick', 0.35, {
    optional: true, floorY: 1.9, ceiling: 5.5, lightColor: 0xffa050, ambientVfx: 'ambient_embers', fog: { color: 0x2a2016, near: 8, far: 36 },
    slopes: [stairs(rect(40, 28, 3, 5), 'x', 4.1, 1.9, { id: 'bm_merdiven' })],
  }),
  room('k_yukselis', 'Valkyr Galerisi', 25, 22, 6, 4, 'stone', 'stone', 0.2, {
    floorY: 3.2, ceiling: 12, lightColor: 0xe8e0c0, ambientVfx: 'ambient_dust', fog: { color: 0x4a4a58, near: 10, far: 44 },
    // gallery stairs, the whole room: 3.2 at the south (door 27,26) up to 6.2 at the north
    slopes: [stairs(rect(25, 22, 6, 4), 'z', 6.2, 3.2, { id: 'ky_valkyr_merdiveni' })],
  }),
  room('yukselis_koltugu', 'Yükseliş Koltuğu', 21, 8, 14, 14, 'stone', 'stone', 0.1, {
    boss: 2, floorY: 6.2, ceiling: 26, lightColor: 0xcfe0ff, ambientVfx: 'ambient_dust', fog: { color: 0x6a7288, near: 14, far: 62 },
  }),
  room('k_av_yolu', 'Av Patikası', 30, 35, 4, 3, 'dirt', 'cave', 0.3, {
    openAir: true, sky: SKY_FIELD, floorY: 3.2, ceiling: 30, lightColor: 0xffc080, ambientVfx: 'ambient_embers', fog: { color: 0xb89868, near: 18, far: 80 },
    slopes: [ramp(rect(30, 35, 4, 3), 'z', 3.2, 0.0, { id: 'ka_patika' })],
  }),
  room('av_meydani', 'Ebedi Av Meydanları', 20, 38, 24, 18, 'dirt', 'cave', 0.5, {
    openAir: true, sky: SKY_FIELD, floorY: 0, ceiling: 30, lightColor: 0xffc080, ambientVfx: 'ambient_embers', fog: { color: 0xd8b080, near: 22, far: 100 },
    // lookout hill x 38..42, z 39..42 at 1.4, reached by the ramp x 36..37
    heightAreas: [area('av_tepesi', 38, 39, 5, 4, 1.4, 'ledge')],
    slopes: [ramp(rect(36, 40, 2, 2), 'x', 0.0, 1.4, { id: 'am_tepe_rampasi' })],
  }),
  room('fenrur_ini', 'Fenrür İni', 44, 42, 14, 12, 'dirt', 'cave', 0.15, {
    boss: 2, floorY: 0, ceiling: 14, lightColor: 0xff6040, ambientVfx: 'ambient_embers', fog: { color: 0x2a1a1a, near: 10, far: 46 },
    // cave ledge x 54..57, z 43..45 at 1.2, reached by the ramp x 52..53
    heightAreas: [area('magara_sekisi', 54, 43, 4, 3, 1.2, 'ledge')],
    slopes: [ramp(rect(52, 43, 2, 2), 'x', 0.0, 1.2, { id: 'fi_sekisi_rampasi' })],
  }),
  room('k_hyrja_dogu', 'Rüzgâr Köprüsü', 35, 17, 11, 4, 'stone', OPEN_WALL, 0.2, {
    skip: true, openAir: true, sky: SKY_STORM, storm: STORM, floorY: 6.2, ceiling: 30, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust',
    fog: { color: 0x5a6a7a, near: 14, far: 72 },
  }),
  room('efemer_yol', 'Geçici Yol', 50, 22, 4, 20, 'stone', OPEN_WALL, 0.15, {
    openAir: true, sky: SKY_STORM, storm: STORM, floorY: 0, ceiling: 30, lightColor: 0xaec4ff, ambientVfx: 'ambient_dust',
    fog: { color: 0x5a6a7a, near: 14, far: 72 }, explicitDecor: true,
    // one ramp strip: 0.0 at the south (z 41) up to 6.2 at the north (z 22)
    slopes: [ramp(rect(50, 22, 4, 20), 'z', 6.2, 0.0, { id: 'ey_gecici_yol' })],
    hazards: [STRIKE(7, 2.0, RODS_WAY)],
  }),
  room('rune_mahzeni', 'Rün Mahzeni', 44, 22, 6, 5, 'stone_dark', 'stone', 0.3, {
    optional: true, floorY: 5.6, ceiling: 7, lightColor: 0x70c0ff, ambientVfx: 'ambient_dust', fog: { color: 0x24303a, near: 8, far: 38 },
  }),
  room('salon_esigi', 'Şan Eşiği', 46, 16, 12, 6, 'stone', OPEN_WALL, 0.2, {
    openAir: true, sky: SKY_GLORY, storm: STORM, floorY: 6.2, ceiling: 30, lightColor: 0xffe0a0, ambientVfx: 'ambient_dust',
    fog: { color: 0x6a6458, near: 16, far: 72 }, explicitDecor: true,
    // grand stair x 46..57, z 16..18 from 8.6 at the north edge down to 6.2 at the flat court (z 19..21)
    slopes: [stairs(rect(46, 16, 12, 3), 'z', 8.6, 6.2, { id: 'se_zafer_merdiveni' })],
    hazards: [STRIKE(10, 2.2, RODS_GATE)],
  }),
  room('salon_arena', 'Şan Salonu', 44, 0, 16, 16, 'stone', OPEN_WALL, 0.05, {
    boss: 3, openAir: true, sky: SKY_GLORY, storm: STORM, floorY: 8.6, ceiling: 30, lightColor: 0xffe8b0, ambientVfx: 'ambient_dust',
    fog: { color: 0xcfc8b0, near: 24, far: 110 }, explicitDecor: true,
    // Odyn's dais, one raised block at the north rim
    heightAreas: [area('odyn_kursusu', 49, 1, 6, 3, 9.4, 'none')],
  }),
];

// ---- doors (16) ---------------------------------------------------------------------------------------------------------------
const DOORS: DoorDef[] = [
  door('giris', 'yuksek_kapi', 10, 54, 'n', 2, 'none'),
  door('yuksek_kapi', 'k_heymdal', 10, 40, 'n', 2, 'none'),
  door('k_heymdal', 'heymdal_zirvesi', 10, 36, 'n', 2, 'boss_lock'),
  door('heymdal_zirvesi', 'solen_ocagi', 17, 29, 'e', 2, 'boss_exit'),
  door('solen_ocagi', 'bal_mahzeni', 39, 29, 'e', 2, 'none'),
  door('solen_ocagi', 'k_yukselis', 27, 26, 'n', 2, 'none'),
  door('k_yukselis', 'yukselis_koltugu', 27, 22, 'n', 2, 'boss_lock'),
  door('solen_ocagi', 'k_av_yolu', 31, 34, 's', 2, 'none'),
  door('k_av_yolu', 'av_meydani', 31, 37, 's', 2, 'none'),
  door('av_meydani', 'fenrur_ini', 43, 47, 'e', 2, 'boss_lock'),
  door('yukselis_koltugu', 'k_hyrja_dogu', 34, 17, 'e', 2, 'boss_exit'),
  door('k_hyrja_dogu', 'salon_esigi', 45, 19, 'e', 2, 'none'),
  door('fenrur_ini', 'efemer_yol', 51, 42, 'n', 2, 'boss_exit'),
  door('efemer_yol', 'salon_esigi', 51, 22, 'n', 2, 'none'),
  door('efemer_yol', 'rune_mahzeni', 50, 24, 'w', 2, 'none'),
  door('salon_esigi', 'salon_arena', 50, 16, 'n', 4, 'boss_lock'),
];

// ---- packs (31) ---------------------------------------------------------------------------------------------------------------
/** Spiral offsets of GDD_CONTENT.layout (tile offsets from the pack centre; melee first, casters last). */
const SPIRAL: [number, number][] = [
  [0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53], [-0.28, 1.03],
  [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.9, -1.15], [-0.95, -1.0], [0.35, 1.6], [-0.4, -1.7],
];

/** Pack of `counts` [enemyId, n] laid on the spiral. Forces are the sum of the member defs (pack() does it). */
function P_PACK(id: string, roomId: string, cx: number, cz: number, counts: [string, number][], extra: PackExtra = {}): PackDef {
  const ids = counts.flatMap(([enemyId, n]) => Array<string>(n).fill(enemyId));
  if (ids.length > SPIRAL.length) throw new Error(`[yigitler_sarayi] pack ${id}: ${ids.length} members, spiral holds ${SPIRAL.length}`);
  return pack(id, roomId, cx, cz, undefined, ids.map((enemyId, i) => [enemyId, SPIRAL[i][0], SPIRAL[i][1]] as [string, number, number]), extra);
}

const DORMANT_CEILING = { kind: 'ceiling' as const, wakeRadius: 15 };

const PACKS: PackDef[] = [
  P_PACK('yg_p01', 'yuksek_kapi', 6.5, 50.5, [['yg_shieldmaiden', 2], ['yg_mystic', 1]]),
  P_PACK('yg_p02', 'yuksek_kapi', 14.5, 50.5, [['yg_shieldmaiden', 2], ['yg_thundercaller', 1]]),
  P_PACK('yg_p03', 'yuksek_kapi', 10.5, 46.5, [['yg_sentinel', 1], ['yg_trapper', 2], ['yg_mystic', 1]],
    { patrol: [[8.5, 46.5], [12.5, 46.5]] }),
  P_PACK('yg_p04', 'yuksek_kapi', 5.5, 42.5, [['yg_storm_drake', 2], ['yg_runecarver', 1]], { dormant: DORMANT_CEILING }),
  P_PACK('yg_p05', 'yuksek_kapi', 15.5, 42.5, [['yg_thundercaller', 1], ['yg_purifier', 1], ['yg_shieldmaiden', 1]]),
  P_PACK('yg_p06', 'k_heymdal', 10.5, 37.5, [['yg_storm_drake', 2]], { dormant: DORMANT_CEILING }),
  P_PACK('yg_p07', 'solen_ocagi', 23, 28.5, [['yg_revel', 8], ['yg_mystic', 1]], { big: true, linkedTo: ['yg_p08'] }),
  P_PACK('yg_p08', 'solen_ocagi', 23, 32, [['yg_revel', 8], ['yg_shieldmaiden', 1]], { big: true, linkedTo: ['yg_p07'] }),
  P_PACK('yg_p09', 'solen_ocagi', 30.5, 27.2, [['yg_shieldmaiden', 2], ['yg_thundercaller', 1], ['yg_mystic', 1]]),
  P_PACK('yg_p10', 'solen_ocagi', 35, 28, [['yg_revel', 6], ['yg_runecarver', 1]], { big: true, linkedTo: ['yg_p11'] }),
  P_PACK('yg_p11', 'solen_ocagi', 35.5, 33, [['yg_sentinel', 1], ['yg_shieldmaiden', 1], ['yg_purifier', 1]], { linkedTo: ['yg_p10'] }),
  P_PACK('yg_p12', 'solen_ocagi', 29.5, 31.5, [['yg_thundercaller', 1], ['yg_shieldmaiden', 2]],
    { patrol: [[27.5, 31.5], [31.5, 31.5]] }),
  P_PACK('yg_p13', 'bal_mahzeni', 43.5, 30, [['yg_revel', 12], ['yg_sentinel', 1]], { optional: true }),
  P_PACK('yg_p14', 'k_yukselis', 27.5, 23.5, [['yg_shieldmaiden', 2], ['yg_runecarver', 1]]),
  P_PACK('yg_p15', 'k_av_yolu', 31.5, 36, [['yg_worg', 4], ['yg_trapper', 1]]),
  P_PACK('yg_p16', 'av_meydani', 25, 42, [['yg_worg', 4], ['yg_stag', 1], ['yg_trapper', 1]]),
  P_PACK('yg_p17', 'av_meydani', 25, 51, [['yg_trapper', 3], ['yg_worg', 2]]),
  P_PACK('yg_p18', 'av_meydani', 31.5, 41, [['yg_grizzly', 1]], { optional: true }),
  P_PACK('yg_p19', 'av_meydani', 40, 40.5, [['yg_thundercaller', 1], ['yg_stag', 1], ['yg_worg', 2]]),
  P_PACK('yg_p20', 'av_meydani', 30, 51.5, [['yg_grizzly', 1]], { optional: true }),
  P_PACK('yg_p21', 'av_meydani', 37, 52, [['yg_grizzly', 1]], { optional: true }),
  P_PACK('yg_p22', 'av_meydani', 32, 46.5, [['yg_worg', 2], ['yg_trapper', 2]], { patrol: [[26, 46.5], [38, 46.5]] }),
  P_PACK('yg_p23', 'k_hyrja_dogu', 37.5, 18.5, [['yg_shieldmaiden', 2], ['yg_thundercaller', 1], ['yg_mystic', 1]]),
  P_PACK('yg_p24', 'k_hyrja_dogu', 42.5, 18.5, [['yg_tideskorn', 1], ['yg_trapper', 2]]),
  P_PACK('yg_p25', 'efemer_yol', 51.5, 39.5, [['yg_tideskorn', 1], ['yg_shieldmaiden', 1]]),
  P_PACK('yg_p26', 'efemer_yol', 51.5, 34.5, [['yg_thundercaller', 1], ['yg_runecarver', 2]]),
  P_PACK('yg_p27', 'efemer_yol', 51.5, 29.5, [['yg_tideskorn', 2]]),
  P_PACK('yg_p28', 'efemer_yol', 51.5, 24.2, [['yg_sentinel', 1], ['yg_shieldmaiden', 1], ['yg_purifier', 1]],
    { patrol: [[51.5, 23.0], [51.5, 25.4]] }),
  P_PACK('yg_p29', 'rune_mahzeni', 46.5, 24, [['yg_runecarver', 2], ['yg_revel', 2]], { optional: true }),
  P_PACK('yg_p30', 'salon_esigi', 47.5, 19.8, [['yg_tideskorn', 2], ['yg_mystic', 1]]),
  P_PACK('yg_p31', 'salon_esigi', 55.5, 19.8, [['yg_sentinel', 1], ['yg_thundercaller', 1], ['yg_purifier', 1]]),
];

// ---- props (set pieces and the boss-relevant landmarks; real models only) ------------------------------------------------------
const LIGHT_BRAZIER = (color = 0xffa850) => lt(color, 1.6, 10);
/** SET-16 Bal Fıçıları: a breakable keg spills a hidromel puddle (r 2.5 m, 10 s, mead_sticky; a fire hit ignites it). */
const KEG: PO = { tag: 'breakable', onBreak: { zone: { radius: 2.5, duration: 10, status: 'mead_sticky', ignitesOnFire: true } } };
const ROD = (x: number, z: number): PropPlacement => P(kg('pillar-obelisk'), x, z, { collide: true, scale: 0.9 });

const PROPS: Record<string, PropPlacement[]> = {
  giris: [P(gp('brazier'), 8.5, 55.5, { light: LIGHT_BRAZIER(0xaec4ff) }), P(gp('brazier'), 13.5, 55.5, { light: LIGHT_BRAZIER(0xaec4ff) })],
  yuksek_kapi: [
    ...RODS_COURT.map(([x, z]) => ROD(x, z)),
    P(gp('brazier'), 6.5, 40.5, { light: LIGHT_BRAZIER(0xaec4ff) }),
    P(gp('brazier'), 13.5, 40.5, { light: LIGHT_BRAZIER(0xaec4ff) }),
  ],
  heymdal_zirvesi: [
    // HEY_PILLARS: lightning rods (cover for the breath bands). Keep in step with the boss script.
    ...[[4.5, 27], [14.5, 27], [4.5, 32.5], [14.5, 32.5]].map(([x, z]) => ROD(x, z)),
    P(gp('brazier'), 3.5, 23.5, { light: LIGHT_BRAZIER(0x80b0ff) }),
    P(gp('brazier'), 15.5, 23.5, { light: LIGHT_BRAZIER(0x80b0ff) }),
  ],
  solen_ocagi: [
    ...[[20.5, 27.5], [21.5, 27.5], [20.5, 33.5], [21.5, 33.5], [33.5, 33.5], [33.5, 26.5], [28.5, 27.5], [28.5, 33.5]]
      .map(([x, z]) => P(dg('keg'), x, z, KEG)),
    ...[[24.5, 27.5], [24.5, 33.5], [30.5, 33.5]].map(([x, z]) => P(dg('barrel_large_decorated'), x, z, KEG)),
    ...banner(rect(18, 26, 22, 9), 'n', [20, 26, 32], { y: 2.5 }),
  ],
  bal_mahzeni: [P(dg('keg'), 42.5, 30.5, KEG), P(dg('keg'), 44.5, 31.5, KEG), P(dg('barrel_large_decorated'), 42.5, 32.5, KEG)],
  k_yukselis: [
    P(gp('statue_hooded'), 25.5, 23.5),
    P(gp('statue_hooded'), 25.5, 25.5),
    P(gp('statue_hooded'), 29.5, 23.5),
    P(gp('statue_hooded'), 29.5, 25.5),
  ],
  yukselis_koltugu: [
    // Solsten (thunder, west) and Olmyr (holy, east): the pillar mechanic of Hirya (script constants PILLAR_T / PILLAR_H).
    P(kg('pillar-obelisk'), 23.5, 14.5, { collide: true, scale: 1.2, light: lt(0x9ad8ff, 2, 12) }),
    P(kg('pillar-obelisk'), 31.5, 14.5, { collide: true, scale: 1.2, light: lt(0xfff0b0, 2, 12) }),
  ],
  k_av_yolu: [P(gp('brazier'), 31.5, 35.5, { light: LIGHT_BRAZIER(0xffc080) }), P(gp('brazier'), 33.5, 37.5, { light: LIGHT_BRAZIER(0xffc080) })],
  av_meydani: [
    P(gp('tent'), 23, 44),
    P(gp('tent'), 27, 50),
    P(gp('brazier'), 39.5, 41.5, { light: LIGHT_BRAZIER(0xffc080) }),
  ],
  fenrur_ini: [
    // kiting stumps around the den (Fenrür's arena is 14 x 12 tiles)
    P(kn('stump_squareDetailedWide'), 46.5, 44.5, { collide: true }),
    P(kn('stump_squareDetailedWide'), 46.5, 50.5, { collide: true }),
    P(kn('stump_squareDetailedWide'), 52.5, 51.5, { collide: true }),
    P(kn('stump_squareDetailedWide'), 56.5, 50.5, { collide: true }),
  ],
  efemer_yol: [
    ...RODS_WAY.map(([x, z]) => ROD(x, z)),
    P(gp('brazier'), 50.5, 26.5, { light: LIGHT_BRAZIER(0xaec4ff) }),
    P(gp('brazier'), 50.5, 36.5, { light: LIGHT_BRAZIER(0xaec4ff) }),
  ],
  salon_esigi: [
    ...RODS_GATE.map(([x, z]) => ROD(x, z)),
    P(gp('brazier'), 47.5, 16.5, { light: LIGHT_BRAZIER(0xffe0a0) }),
    P(gp('brazier'), 56.5, 16.5, { light: LIGHT_BRAZIER(0xffe0a0) }),
  ],
  salon_arena: [
    // Aegis pedestal, rune pads (positions match the boss script PADS) and the colossal pillars at the corners
    P(kg('altar-stone'), 51.5, 8.5, { collide: true }),
    ...[[51.5, 13.5], [55.04, 12.04], [56.5, 8.5], [55.04, 4.96], [51.5, 3.5], [47.96, 4.96], [46.5, 8.5], [47.96, 12.04]]
      .map(([x, z]) => P(gp('crystal_blue'), x, z, { scale: 0.4, light: lt(0xf4f8ff, 0.6, 3) })),
    P(kg('column-large'), 46.5, 2.5, { collide: true }),
    P(kg('column-large'), 56.5, 2.5, { collide: true }),
    P(kg('column-large'), 46.5, 13.5, { collide: true }),
    P(kg('column-large'), 56.5, 13.5, { collide: true }),
  ],
};

const ROOMS_WITH_PROPS: RoomDef[] = ROOMS.map((r) => (PROPS[r.id] ? { ...r, props: PROPS[r.id] } : r));

// ---- bosses (4; the finale is one entity with two stages) -----------------------------------------------------------------
const BOSSES = [
  bossAt('boss_heymdal', 'heymdal_zirvesi', 9.5, 26, 0, 1),
  bossAt('boss_hirya', 'yukselis_koltugu', 27.5, 13, 0, 2),
  bossAt('boss_fenrur', 'fenrur_ini', 50.5, 47, -90, 2),
  bossAt('boss_odyn', 'salon_arena', 51.5, 2.5, 0, 3),
];

// ---- theme ----------------------------------------------------------------------------------------------------------------------
const THEME: DungeonTheme = {
  fogColor: 0x56626e, fogNear: 16, fogFar: 70,
  ambient: 0x7c88a0, ambientIntensity: 0.5, hemiSky: 0xa4b4d0, hemiGround: 0x2c2a30,
  torchColor: 0xffb060, bloomStrength: 0.5,
  music: 'dungeon_frost',     // existing MusicId (file dungeon_cold_sanctuary.mp3); the bosses use the existing 'boss' track in the script
  palette: [0x2b2f38, 0x56626e, 0x9aa8bc, 0xd9b45a, 0xb87a3a, 0xeaf2ff, 0x7a5cff, 0xffa850], tint: 0xb4bccc,
  sky: SKY_DUSK,
  cloudSea: { y: -6, color: 0x6a7686, speed: 0.04 },
};

export const YIGITLER_SARAYI: DungeonDef = {
  id: 'yigitler_sarayi',
  name: 'Yiğitler Sarayı',
  shortName: 'Yiğitler',
  lore: "Kadimler, ölen yiğitlerin ruhlarını sınamak için fırtınanın üstüne bir saray kaldırdı: Yiğitler Sarayı. Titan kemerleri bulutların üzerinde yüzüyor, Odyn'in ebedi şölenine açılıyor. Yüksek Kapı'da Heymdal'ın borusu çalıyor; Eyra'nın Seçilmişi Hirya yükseliş koltuğunu bekliyor; Fenrür Sonsuz Av'da kan kokusu alıyor. Ama Gelgitkıran Kralı Skovald, Kadim Zindanlar'ın gölgesinden gelen bir fısıltıya kulak verdi ve kutsal Aegis'i çalmak için Şan Salonu'na daldı. Sınav başladı. Layık olan, Odyn'in sofrasına oturur.",
  levelRange: [60, 60],
  timerSec: 1920,
  forcesRequired: 325,
  theme: THEME,
  grid: { w: 64, h: 60 },
  rooms: ROOMS_WITH_PROPS,
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: shPt(10.5, 57.2), facing: 180 },
  exit: { pos: shPt(51.5, 10.5) },
  extras: {
    fontOfPower: pt(10.5, 55.2),
    shrines: [
      { type: 'shrine_haste', pos: pt(44.5, 31) },     // Hidromel Fıçısı, Bal Mahzeni (optional detour)
      { type: 'shrine_ward', pos: pt(19.5, 33.5) },    // Koruma Sunağı, Hearth SW, before the fork bosses
      { type: 'shrine_power', pos: pt(51.5, 18.8) },   // Kudret Sunağı, Şan Eşiği, between p30 and p31
    ],
    riftSpots: [pt(10.5, 52), pt(24.5, 30.5), pt(36.5, 30.5), pt(30, 45), pt(36.5, 49), pt(51.5, 33.5)],
    chests: [{ pos: pt(44.8, 28.3), kind: 'chest_gold' }, { pos: pt(48.6, 22.4), kind: 'chest_iron' }, { pos: pt(17.8, 46.2), kind: 'chest_wood' }],
  },
  season: 1,
  endgame: true,
  vertical: true,
  lifts: [],
};

export const YIGITLER_SARAYI_ROOM_COUNT = ROOMS.length;
