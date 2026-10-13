import type { DecorTier, DungeonDef, PackDef, RoomDef, TileRect, ZoneDef } from '../../types/dungeons';
import { bossAt, chandelier, circleZone, decorator, dg, door, gp, ks, kg, kn, lt, makeCtx, pack, plateau, pt, Props, ramp, rectsOf, rectZone, room, shPt, stairs, withProps, banner } from './kit';
import type { PO } from './kit';

/**
 * Taşkasa (`taskasa`), Mythic+ season pool dungeon 7 of 8 (docs/dungeons/taskasa.md).
 * Layout, heights, packs, bosses, extras and set dressing. Enemy defs live in src/data/enemies_taskasa.ts,
 * boss scripts in src/ai/bosses/taskasa.ts. Registration lines for the shared files are reported to the orchestrator.
 *
 * Coordinates: GDD convention (continuous tile c -> world (c + 0.5) * 4). Room / door / zone rects are tile-corner based.
 * Heights: RoomDef.floorY and ceiling (clearance above the local floor), slopes (SlopeDef yFrom/yTo absolute), plateaus
 * (HeightArea) and galleries (DecorTier, absolute y). PropPlacement.y is an offset from the ground under the prop.
 */

const GOLD = 0xffd54a;
const LAVA = 0xff8c1a;
const EMBER = 0xa8301c;
const TEAL = 0x3fe0c8;
const VOID = 0x7a3cff;

// ---------------------------------------------------------------------------------------------------------------------
// Models. NEW props (tk_*) use the fallbacks of docs/dungeons/taskasa.md section 8.1 until the Blender assets exist.
// ---------------------------------------------------------------------------------------------------------------------
const M_GATE = dg('wall_doorway_scaffold');        // tk_rune_gate_grand fallback (scale 2.2, tint 0x8a6a50)
const M_PILLAR = dg('pillar_decorated');           // tk_titan_pillar fallback (scale 1.6)
const M_STATUE = gp('statue_hooded');              // tk_titan_statue / sentinel fallback
const M_BRAZIER = gp('brazier');
const M_CRYSTAL = gp('crystal_blue');              // tk_skardyn_crystal fallback
const M_CRYSTAL_P = gp('crystal_purple');          // tk_void_rift fallback
const M_RAIL = dg('wall_half');                    // tk_gallery_rail fallback (scale 0.5)
const M_CAULDRON = gp('cauldron');                 // tk_ladle_hanging / crucibles
const M_WAGON = gp('wagon');                       // tk_mine_cart fallback (scale 0.6)
const M_CHAIN = gp('chains_hanging');
const M_GRATE = dg('floor_tile_big_grate');        // vent / steam grate
const M_FORGE = gp('forge');
const M_ANVIL = gp('anvil');                       // tk_forge_anvil_great fallback
const M_ROCK = gp('rock_cliff');                   // tk_lava_fall fallback
const M_BANNER_LONG = dg('banner_triple_brown');   // tk_banner_long fallback (scale 2)
const M_BANNER_A = dg('banner_patternA_brown');
const M_STAL = kn('rock_tallA');                   // tk_stalactite fallback (scale 0.6)
const M_SCRAP_PILE = gp('bone_pile');              // tk_scrap_pile fallback
const M_CRATES = dg('crates_stacked');             // tk_scrap_block fallback
const M_BOX = dg('box_large');                     // tk_scrap_cube fallback
const M_STRUCT = ks('structure-metal');            // tk_machine_housing fallback
const M_SIGN = gp('signpost');                     // tk_cart_station fallback
const M_LAMP = gp('lamp_post');
const M_ALTAR = kg('altar-stone');
const M_STATUE_RING = kn('statue_ring');           // tk_awakening_wheel fallback (scale 3)
const M_STATUE_HEAD = kn('statue_head');           // tk_titan_relief fallback (scale 2)
const M_STATUE_BLOCK = kn('statue_block');         // tk_rune_block fallback
const M_STONE_TALL = kn('stone_tallA');            // tk_volatile_spike fallback (scale 0.7)
const M_SPIKES = dg('floor_tile_big_spikes');
const M_SCAFFOLD_BARREL = ks('barrel');
const M_BARREL_L = dg('barrel_large');
const M_SACKS = gp('sacks');

/** Gallery (non-walkable upper ledge) at absolute height y. */
const gal = (x: number, z: number, w: number, h: number, y: number): DecorTier => ({ kind: 'gallery', y, rect: { x, z, w, h } });
/** Shorthand for a rect in tile-corner units. */
const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });

// ---------------------------------------------------------------------------------------------------------------------
// Rooms (base data). Floors and walls are the final styles of the doc (SP-12 landed in the builder).
// ---------------------------------------------------------------------------------------------------------------------
const ROOM_BASE: RoomDef[] = [
  room('giris', 'Kasa Eşiği', 28, 74, 16, 10, 'earthen_dark', 'earthen', 0.3),
  room('yaklasim', 'Muhafız Yaklaşımı', 22, 62, 28, 12, 'earthen', 'earthen', 0.45),
  room('maden_ambari', 'Madenci Ambarı', 10, 64, 12, 8, 'dirt', 'cave', 0.6, { optional: true }),
  room('ray_gecidi', 'Eski Raylar', 8, 60, 4, 4, 'dirt', 'cave', 0.3, { skip: true }),
  room('merkez', 'Merkezi İşleme', 16, 44, 40, 18, 'earthen', 'earthen', 0.3),
  room('k_bati', 'Batı Maden Yolu', 10, 50, 6, 4, 'earthen_dark', 'earthen', 0.4),
  room('dokum_girisi', 'Şarkı Söyleyen Dökümhane', 0, 44, 10, 16, 'lava_rock', 'forge', 0.5),
  room('k_dokum', 'Örs Geçidi', 4, 40, 4, 4, 'earthen_dark', 'earthen', 0.3),
  room('makinist_odasi', 'Makinistler Salonu', 0, 28, 12, 12, 'tiles', 'forge', 0.15, { boss: 2 }),
  room('k_dogu', 'Doğu Maden Yolu', 56, 50, 6, 4, 'earthen_dark', 'earthen', 0.4),
  room('pota_girisi', 'Pota Girişi', 62, 44, 10, 16, 'lava_rock', 'cave', 0.5),
  room('k_pota', 'Kor Geçidi', 64, 40, 4, 4, 'dirt', 'cave', 0.3),
  room('skarmorak_odasi', 'Kristal Kazanı', 58, 26, 14, 14, 'lava_rock', 'cave', 0.15, { boss: 2 }),
  room('k_edna', 'Otomat Geçidi', 34, 40, 4, 4, 'earthen_dark', 'earthen', 0.3),
  room('edna_odasi', 'Savunma Çekirdeği', 27, 26, 18, 14, 'tiles', 'earthen', 0.15, { boss: 1 }),
  room('titan_koridoru', 'Titan Tünelleri', 24, 18, 24, 8, 'earthen_dark', 'earthen', 0.4),
  room('fisilti_salonu', 'Fısıltı Salonu', 24, 0, 24, 18, 'earthen_dark', 'earthen', 0.1, { boss: 3 }),
];

const GOLD_RUNE = (cx: number, cz: number, r: number, glow: number, glowIntensity: number, color = 0x1a0f08): ZoneDef =>
  circleZone('rune', cx, cz, r, { color, glow, glowIntensity });

/** Height features, lighting, fog, galleries and zones per room (docs/dungeons/taskasa.md 3.2b, 3.2c, 3.6). */
const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: {
    floorY: 2.4, ceiling: 14, ceilingDark: true, ambientVfx: 'ambient_dust', lightColor: GOLD,
    zones: [GOLD_RUNE(35.5, 77.8, 1.2, GOLD, 0.5)],
  },
  yaklasim: {
    floorY: 0, ceiling: 16, ceilingDark: true, ambientVfx: 'ambient_dust', explicitDecor: true,
    fog: { color: 0x2a150d, near: 12, far: 62 },
    slopes: [stairs(rect(32, 69, 7, 5), 'z', 0, 2.4, { id: 'grand_stair' })],
    tiers: [gal(22, 63, 1, 10, 7.0), gal(49, 63, 1, 10, 7.0)],
  },
  maden_ambari: { floorY: 0, ceiling: 8, ceilingDark: true, ambientVfx: 'ambient_dust' },
  ray_gecidi: { ceiling: 5, ceilingDark: true, slopes: [ramp(rect(8, 60, 4, 4), 'z', 1.2, 0)] },
  merkez: {
    floorY: 0, ceiling: 24, ceilingDark: true, explicitDecor: true, lightColor: LAVA, ambientVfx: 'ambient_embers',
    fog: { color: 0x2e170e, near: 16, far: 84 },
    zones: [
      circleZone('lava', 35.5, 51.5, 4.5, {
        blocked: true, y: -3, fall: 'open', depth: 3, color: 0x7a1a05, glow: 0xff6a10, glowIntensity: 1.5,
        hazard: { coef: 1.2, interval: 0.5 }, light: { color: LAVA, intensity: 1.8, distance: 20, flicker: true, y: -1.5 },
      }),
      rectZone('bridge', 35, 47, 2, 10, { y: 0, color: 0x2a1a12 }),
      rectZone('bridge', 31, 51, 10, 2, { y: 0, color: 0x2a1a12 }),
      circleZone('dais', 35.5, 51.5, 2.2, { blocked: false, y: 0.45, color: 0x3a2418, glow: GOLD, glowIntensity: 0.5 }),
      circleZone('dais', 35.5, 51.5, 1.5, { blocked: false, y: 0.9, color: 0x3a2418, glow: GOLD, glowIntensity: 0.7 }),
    ],
    hazards: [{ kind: 'lava_burst', interval: 5, warn: 1.2, radius: 2.0, coef: 1.8, vfx: 'volcanic_plume' }],
    tiers: [gal(18, 44, 34, 1, 7.2), gal(18, 61, 34, 1, 7.2), gal(16, 46, 1, 12, 7.2), gal(55, 46, 1, 12, 7.2)],
  },
  k_bati: { ceiling: 7, ceilingDark: true, slopes: [ramp(rect(10, 50, 6, 4), 'x', 1.2, 0)] },
  k_dogu: { ceiling: 7, ceilingDark: true, slopes: [ramp(rect(56, 50, 6, 4), 'x', 0, -1.2)] },
  k_dokum: { ceiling: 7, ceilingDark: true, slopes: [ramp(rect(4, 40, 4, 4), 'z', 2.4, 1.2)] },
  dokum_girisi: {
    floorY: 1.2, ceiling: 14, ceilingDark: true, lightColor: LAVA, ambientVfx: 'ambient_embers',
    fog: { color: 0x3a2a24, near: 8, far: 44 },
    heightAreas: [plateau(rect(6, 57, 4, 3), 1.65, 'none', 'orsu_terrace')],
    hazards: [{ kind: 'lava_burst', interval: 6, warn: 1.2, radius: 2.0, coef: 1.8, vfx: 'volcanic_plume' }],
    tiers: [gal(9, 45, 1, 13, 7.0)],
  },
  makinist_odasi: {
    floorY: 2.4, ceiling: 20, ceilingDark: true, explicitDecor: true, lightColor: LAVA, ambientVfx: 'ambient_embers',
    fog: { color: 0x2a150d, near: 14, far: 70 },
    zones: [
      rectZone('vent', 0, 29, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      rectZone('vent', 8, 29, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      rectZone('vent', 0, 37, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      rectZone('vent', 8, 37, 3, 3, { blocked: false, color: 0x2a1008, glow: EMBER, glowIntensity: 0.6 }),
      GOLD_RUNE(5.5, 33.5, 1.4, GOLD, 0.6),
    ],
    tiers: [gal(0, 28, 12, 1, 10.4)],
  },
  pota_girisi: {
    floorY: -1.2, ceiling: 14, ceilingDark: true, lightColor: TEAL, ambientVfx: 'ambient_dust',
    fog: { color: 0x1a2420, near: 10, far: 50 },
    tiers: [gal(71, 45, 1, 13, 4.3)],
  },
  k_pota: {
    ceiling: 7, ceilingDark: true, lightColor: TEAL, fog: { color: 0x1a2420, near: 8, far: 44 },
    slopes: [ramp(rect(64, 40, 4, 4), 'z', -2.4, -1.2)],
  },
  skarmorak_odasi: {
    floorY: -2.4, ceiling: 20, ceilingDark: true, explicitDecor: true, lightColor: TEAL, ambientVfx: 'ambient_dust',
    fog: { color: 0x1a2420, near: 10, far: 50 },
    zones: [GOLD_RUNE(64.5, 32.5, 5.5, TEAL, 0.45, 0x0e1a18)],
    tiers: [gal(58, 26, 13, 1, 1.6)],
  },
  k_edna: { ceiling: 8, ceilingDark: true, slopes: [ramp(rect(34, 40, 4, 4), 'z', 1.2, 0)] },
  edna_odasi: {
    floorY: 1.2, ceiling: 18, ceilingDark: true, explicitDecor: true, lightColor: GOLD, ambientVfx: 'ambient_dust',
    fog: { color: 0x2a150d, near: 14, far: 70 },
    zones: [GOLD_RUNE(35.5, 32.5, 6.5, GOLD, 0.55), GOLD_RUNE(35.5, 32.5, 3.5, GOLD, 0.7)],
    tiers: [gal(27, 26, 18, 1, 8.4), gal(27, 39, 18, 1, 8.4), gal(27, 27, 1, 12, 8.4), gal(44, 27, 1, 12, 8.4)],
  },
  titan_koridoru: {
    ceiling: 10, ceilingDark: true, lightColor: GOLD, ambientVfx: 'ambient_dust',
    fog: { color: 0x1e100a, near: 12, far: 60 },
    slopes: [stairs(rect(24, 18, 24, 8), 'z', -3.6, 1.2, { id: 'descent' })],
    tiers: [gal(24, 18, 1, 8, 4.5), gal(47, 18, 1, 8, 4.5)],
  },
  fisilti_salonu: {
    floorY: -3.6, ceiling: 30, ceilingDark: true, explicitDecor: true, lightColor: VOID, ambientVfx: 'ambient_shadow_wisps',
    fog: { color: 0x1c0e2e, near: 12, far: 64 },
    heightAreas: [plateau(rect(30, 0, 11, 5), -3.15, 'none', 'eirich_dais_outer'), plateau(rect(32, 0, 7, 4), -2.7, 'none', 'eirich_dais_inner')],
    zones: [GOLD_RUNE(35.5, 8.5, 9, VOID, 0.55, 0x14081c), GOLD_RUNE(35.5, 8.5, 5, VOID, 0.7, 0x14081c)],
    tiers: [gal(24, 2, 1, 14, 2.4), gal(47, 2, 1, 14, 2.4)],
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Doors (tile on the shared edge in room a). Height step per door is within 0.45 m (docs 3.3).
// ---------------------------------------------------------------------------------------------------------------------
const DOORS = [
  door('giris', 'yaklasim', 35, 74, 'n', 2, 'none'),
  door('yaklasim', 'merkez', 34, 62, 'n', 4, 'none'),
  door('yaklasim', 'maden_ambari', 22, 66, 'w', 2, 'none'),
  door('maden_ambari', 'ray_gecidi', 10, 64, 'n', 2, 'none'),
  door('ray_gecidi', 'dokum_girisi', 8, 60, 'n', 2, 'none'),
  door('merkez', 'k_bati', 16, 51, 'w', 2, 'none'),
  door('k_bati', 'dokum_girisi', 10, 51, 'w', 2, 'none'),
  door('dokum_girisi', 'k_dokum', 5, 44, 'n', 2, 'none'),
  door('k_dokum', 'makinist_odasi', 5, 40, 'n', 2, 'boss_lock'),
  door('merkez', 'k_dogu', 55, 51, 'e', 2, 'none'),
  door('k_dogu', 'pota_girisi', 61, 51, 'e', 2, 'none'),
  door('pota_girisi', 'k_pota', 65, 44, 'n', 2, 'none'),
  door('k_pota', 'skarmorak_odasi', 65, 40, 'n', 2, 'boss_lock'),
  door('merkez', 'k_edna', 35, 44, 'n', 2, 'none'),
  door('k_edna', 'edna_odasi', 35, 40, 'n', 2, 'boss_lock'),
  door('edna_odasi', 'titan_koridoru', 35, 26, 'n', 2, 'boss_exit'),
  door('titan_koridoru', 'fisilti_salonu', 35, 18, 'n', 2, 'boss_lock'),
];

// ---------------------------------------------------------------------------------------------------------------------
// Packs (docs/dungeons/taskasa.md 4.4). Forces are the roster sums (trash forces from 4.1).
// Member offsets: front line (0.3,0) (-0.38,0.35) (0.06,-0.66) (0.48,0.62) (-0.88,-0.16) (0.83,-0.53) (-0.28,1.03) (-0.53,-1.02) (1.15,0.42) (-1.2,0.49), back line (1.1,-0.75) (1.35,0.1) (0.95,0.9).
// ---------------------------------------------------------------------------------------------------------------------
const PACKS: PackDef[] = [
  pack('tk_p01', 'yaklasim', 25.5, 70, 12, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_hurda', -0.88, -0.16], ['tk_hurda', 0.83, -0.53], ['tk_hurda', -0.28, 1.03], ['tk_hurda', -0.53, -1.02], ['tk_onarici', 1.1, -0.75]], { dormant: { kind: 'egg', wakeRadius: 6 } }),
  pack('tk_p02', 'yaklasim', 30.5, 66, 12, [['tk_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p03', 'yaklasim', 40.5, 70.5, 13, [['tk_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_uluyan', 1.1, -0.75]]),
  pack('tk_p04', 'yaklasim', 41.5, 65.5, 14, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_istilaci', 1.1, -0.75], ['tk_ruh', 1.35, 0.1]], { big: true }),
  pack('tk_p05', 'yaklasim', 35.5, 64.5, 13, [['tk_onur', 0.3, 0], ['tk_sekillendirici', 1.1, -0.75]]),
  pack('tk_p06', 'merkez', 18.5, 45.5, 16, [['tk_yukleyici', 0.3, 0], ['tk_onarici', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1], ['tk_sozcu', 0.95, 0.9]]),
  pack('tk_p07', 'merkez', 25, 58.5, 15, [['tk_istilaci', 1.1, -0.75], ['tk_ruh', 1.35, 0.1], ['tk_uluyan', 0.95, 0.9]]),
  pack('tk_p08', 'merkez', 18.5, 54, 14, [['tk_dokum_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35]], { big: true }),
  pack('tk_p09', 'merkez', 46, 58.5, 16, [['tk_onur', 0.3, 0], ['tk_onarici', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1]]),
  pack('tk_p10', 'merkez', 52.5, 45.5, 15, [['tk_ezici', 0.3, 0], ['tk_sekillendirici', 1.1, -0.75]]),
  pack('tk_p11', 'merkez', 52.5, 54, 10, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_hurda', -0.88, -0.16], ['tk_hurda', 0.83, -0.53], ['tk_hurda', -0.28, 1.03], ['tk_hurda', -0.53, -1.02], ['tk_hurda', 1.15, 0.42], ['tk_hurda', -1.2, 0.49]], { dormant: { kind: 'egg', wakeRadius: 6 } }),
  pack('tk_p12', 'merkez', 25, 49.5, 12, [['tk_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p13', 'merkez', 46, 49.5, 14, [['tk_yagmaci', 0.3, 0], ['tk_ruh', 1.1, -0.75]]),
  pack('tk_p14', 'merkez', 35.5, 46, 12, [['tk_yagmaci', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62]], { patrol: [[29.5, 46], [41.5, 46], [41.5, 57], [29.5, 57]] }),
  pack('tk_p15', 'k_edna', 35.5, 41.5, 8, [['tk_yukleyici', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p16', 'k_bati', 12.5, 51.5, 8, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p17', 'dokum_girisi', 4, 56.5, 18, [['tk_dokum_yukleyici', 0.3, 0], ['tk_yukleyici', -0.38, 0.35], ['tk_onarici', 1.1, -0.75]]),
  pack('tk_p18', 'dokum_girisi', 3.5, 51.5, 13, [['tk_sozcu', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1], ['tk_uluyan', 0.95, 0.9]]),
  pack('tk_p19', 'dokum_girisi', 6.5, 46.5, 14, [['tk_dokum_yukleyici', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p20', 'k_dokum', 5.5, 41.5, 12, [['tk_onur', 0.3, 0], ['tk_onarici', 1.1, -0.75]]),
  pack('tk_p21', 'k_dogu', 58.5, 51.5, 9, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_ruh', 1.1, -0.75]]),
  pack('tk_p22', 'pota_girisi', 69.5, 51.5, 17, [['tk_yagmaci', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_uluyan', 1.1, -0.75]], { big: true }),
  pack('tk_p23', 'pota_girisi', 69.5, 46.5, 15, [['tk_istilaci', 1.1, -0.75], ['tk_istilaci', 1.35, 0.1], ['tk_ruh', 0.95, 0.9]]),
  pack('tk_p24', 'pota_girisi', 69.5, 57, 12, [['tk_onur', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p25', 'pota_girisi', 64.5, 52, 13, [['tk_yagmaci', 0.3, 0], ['tk_yukleyici', -0.38, 0.35]], { patrol: [[64.5, 46.5], [64.5, 57.5]] }),
  pack('tk_p26', 'k_pota', 65.5, 41.5, 14, [['tk_ezici', 0.3, 0], ['tk_sozcu', 1.1, -0.75]]),
  pack('tk_p27', 'titan_koridoru', 26.5, 22.5, 16, [['tk_onur', 0.3, 0], ['tk_onarici', 1.1, -0.75], ['tk_onarici', 1.35, 0.1]]),
  pack('tk_p28', 'titan_koridoru', 31.5, 19.5, 14, [['tk_sekillendirici', 1.1, -0.75], ['tk_sekillendirici', 1.35, 0.1], ['tk_sozcu', 0.95, 0.9]]),
  pack('tk_p29', 'titan_koridoru', 43, 23.5, 18, [['tk_ezici', 0.3, 0], ['tk_onur', -0.38, 0.35]], { big: true, linkedTo: ['tk_p30'] }),
  pack('tk_p30', 'titan_koridoru', 45, 20, 19, [['tk_yagmaci', 0.3, 0], ['tk_istilaci', 1.1, -0.75], ['tk_ruh', 1.35, 0.1]], { linkedTo: ['tk_p29'] }),
  pack('tk_p31', 'titan_koridoru', 39, 19.5, 20, [['tk_ezici', 0.3, 0], ['tk_ezici', -0.38, 0.35]], { big: true }),
  pack('tk_p32', 'maden_ambari', 14, 67.5, 20, [['tk_dokum_yukleyici', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_hurda', -0.88, -0.16], ['tk_hurda', 0.83, -0.53], ['tk_hurda', -0.28, 1.03], ['tk_onarici', 1.1, -0.75]], { dormant: { kind: 'egg', wakeRadius: 7 }, linkedTo: ['tk_p33', 'tk_p34'], optional: true }),
  pack('tk_p33', 'maden_ambari', 18.5, 69, 23, [['tk_ezici', 0.3, 0], ['tk_sekillendirici', 1.1, -0.75], ['tk_sozcu', 1.35, 0.1], ['tk_sozcu', 0.95, 0.9]], { linkedTo: ['tk_p32', 'tk_p34'], optional: true }),
  pack('tk_p34', 'maden_ambari', 12.5, 70, 18, [['tk_onur', 0.3, 0], ['tk_istilaci', 1.1, -0.75], ['tk_uluyan', 1.35, 0.1]], { linkedTo: ['tk_p32', 'tk_p33'], optional: true }),
  pack('tk_p35', 'ray_gecidi', 9.5, 61.5, 9, [['tk_hurda', 0.3, 0], ['tk_hurda', -0.38, 0.35], ['tk_hurda', 0.06, -0.66], ['tk_hurda', 0.48, 0.62], ['tk_ruh', 1.1, -0.75]], { optional: true, stealth: true }),
];

// ---------------------------------------------------------------------------------------------------------------------
// Bosses. Boss 1 Seda (edna), 2 Skarmorak and 3 Makinistler (Brokk + Dorlita, paired), 4 Eirich (final).
// ---------------------------------------------------------------------------------------------------------------------
const BOSSES = [
  bossAt('boss_seda', 'edna_odasi', 35.5, 30, 0, 1),
  bossAt('boss_skarmorak', 'skarmorak_odasi', 64.5, 30.5, 0, 2),
  bossAt('boss_dorlita', 'makinist_odasi', 6, 31.5, 0, 2),
  bossAt('boss_brokk', 'makinist_odasi', 4, 30, 0, 2),
  bossAt('boss_eirich', 'fisilti_salonu', 35.5, 6.5, 0, 3),
];

const START: [number, number] = [35.5, 80.5];
const FONT: [number, number] = [35.5, 77.8];
const EXIT: [number, number] = [35.5, 3.5];
const RIFT_SOCKETS: [number, number][] = [[26.5, 9], [44.5, 9], [28.5, 3], [42.5, 3], [26.5, 14], [44.5, 14]];

// ---------------------------------------------------------------------------------------------------------------------
// Set dressing (docs/dungeons/taskasa.md 3.7). Props are placed with GDD coordinates through the kit Props helper.
// Anchors (vents, scrap blocks, shard spots, rift spots, carts, the anvil) carry the ids the boss scripts read.
// ---------------------------------------------------------------------------------------------------------------------
const pile = (p: Props, cx: number, cz: number, offsets: [number, number][]): void => {
  for (const [ox, oz] of offsets) p.at(M_SCRAP_PILE, cx + ox, cz + oz, { tint: 0xb08a50, tag: 'wake' });
};
/** The first offsets of the standard member layout (docs 4.4). */
const OFFS: [number, number][] = [[0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53], [-0.28, 1.03], [-0.53, -1.02]];

function dressRooms(p: (id: string, fn: (pr: Props, r: TileRect) => void) => void): void {
  p('giris', (q) => {
    q.at(M_STATUE, 30, 81.5, { tint: 0x8a7a68, scale: 1.3, rot: 45, collide: true });
    q.at(M_STATUE, 41, 81.5, { tint: 0x8a7a68, scale: 1.3, rot: -45, collide: true });
    q.at(M_BRAZIER, 31, 76.5, { scale: 1.6, collide: true, light: lt(0xa8301c, 1.2, 8, true) });
    q.at(M_BRAZIER, 40, 76.5, { scale: 1.6, collide: true, light: lt(0xa8301c, 1.2, 8, true) });
    q.at(dg('crates_stacked'), 29, 82.5, { collide: true });
    q.at(dg('barrel_large'), 41.5, 82.8, { collide: true });
    q.at(M_STATUE, 31, 74.6, { scale: 2.4, tint: 0x8a7a68, collide: true });
    q.at(M_STATUE, 40, 74.6, { scale: 2.4, tint: 0x8a7a68, collide: true });
    q.row(M_RAIL, 28.5, 73.8, 30.5, 73.8, 3, { scale: 0.5, tint: 0x7a7f88 });
    q.row(M_RAIL, 39.5, 73.8, 42.5, 73.8, 4, { scale: 0.5, tint: 0x7a7f88 });
    q.at(M_ROCK, 27.8, 78, { rot: 90, scale: 1.2, tint: 0xff6a10, emissive: 0xff6a10, emissiveIntensity: 0.8 });
    q.at(M_ROCK, 43.2, 78, { rot: -90, scale: 1.2, tint: 0xff6a10, emissive: 0xff6a10, emissiveIntensity: 0.8 });
    q.at(dg('stairs_walled'), 35.5, 82.8, { id: 'stairs_up' });
    q.at(gp('font_of_power'), FONT[0], FONT[1], { id: 'font_of_power', collide: true, light: lt(GOLD, 1.4, 9, true) });
    q.list.push(...banner(rect(28, 74, 16, 10), 'w', [75.5, 80], { model: M_BANNER_A, y: 3 }));
    q.list.push(...banner(rect(28, 74, 16, 10), 'e', [75.5, 80], { model: M_BANNER_A, y: 3 }));
    q.torches(rect(28, 74, 16, 10), 'w', [76, 79, 82], GOLD);
    q.torches(rect(28, 74, 16, 10), 'e', [76, 79, 82], GOLD);
    q.at(dg('sword_shield_gold'), 27.9, 77, { y: 2.5 });
    q.at(dg('sword_shield_gold'), 27.9, 82, { y: 2.5 });
    q.scatter(6, [ks('resource-stone')], { x0: 29, z0: 78, x1: 42, z1: 81 });
  });

  p('yaklasim', (q, r) => {
    // Colonnade
    for (const x of [24, 28, 31.5, 40, 44, 47.5]) q.at(M_PILLAR, x, 62.6, { scale: 1.6, tint: 0xb08868, collide: true });
    for (const x of [23.5, 27.5, 29.8, 43.5, 46, 48.4]) q.at(M_PILLAR, x, 72.7, { scale: 1.6, tint: 0xb08868, collide: true });
    // Gate frame and lava pours at D2
    q.at(M_GATE, 35.5, 61.7, { rot: 180, scale: 2.2, tint: 0x8a6a50, tag: 'gate' });
    q.at(M_ROCK, 29.5, 61.8, { scale: 1.2, tint: 0xff6a10, emissive: 0xff6a10, emissiveIntensity: 0.8, light: lt(LAVA, 1.8, 14, true) });
    q.at(M_ROCK, 41.5, 61.8, { scale: 1.2, tint: 0xff6a10, emissive: 0xff6a10, emissiveIntensity: 0.8, light: lt(LAVA, 1.8, 14, true) });
    // Grand stair dressing
    q.row(M_RAIL, 31.5, 69, 31.5, 73, 5, { scale: 0.5, tint: 0x7a7f88 });
    q.row(M_RAIL, 38.5, 69, 38.5, 73, 5, { scale: 0.5, tint: 0x7a7f88 });
    // Hand-placed clutter and the wake piles of p01
    pile(q, 25.5, 70, OFFS);
    q.at(M_WAGON, 46.5, 69.5, { rot: 90, scale: 0.6, collide: true });
    q.row(M_BARREL_L, 22.8, 64, 22.8, 66.8, 3, { collide: true });
    q.at(M_SACKS, 22.5, 63.2, {});
    q.at(M_SACKS, 23.2, 68.2, {});
    q.at(M_CRATES, 24.2, 63.6, { collide: true });
    q.at(M_CRATES, 24.8, 68.6, { collide: true });
    q.at(dg('rubble_large'), 45.5, 63.9, {});
    q.at(dg('rubble_large'), 48.8, 64.5, {});
    q.at(ks('resource-stone-large'), 23.2, 72.6, {});
    q.at(ks('resource-stone-large'), 47.8, 72.6, {});
    // Galleries: statues and rails (absolute y 7.0, floor 0)
    for (const x of [22.5, 49.5]) {
      for (const z of [64, 66.5, 69, 71.5]) q.at(M_STATUE, x, z, { scale: 2.2, tint: 0x8a7a68, y: 7.0 });
      q.row(M_RAIL, x, 63.5, x, 72.5, 10, { scale: 0.5, tint: 0x7a7f88, y: 7.0 });
    }
    // Banners, chandeliers, stalactites
    q.list.push(...banner(r, 'n', [24, 28, 31, 40, 44, 48], { model: M_BANNER_LONG, y: 5, scale: 2 }));
    q.list.push(...chandelier(28, 67, 11, { light: false }));
    q.list.push(...chandelier(43, 67, 11, { light: false }));
    q.list.push(...chandelier(36, 71, 11, { light: false }));
    q.row(M_STAL, 24, 64, 48, 64, 8, { scale: 0.6, tint: 0x4a3020, y: 15 });
    // Torches
    q.torches(r, 'w', [64, 68, 72], GOLD);
    q.torches(r, 'e', [64, 68, 72], GOLD);
    q.torches(r, 'n', [26, 46], GOLD);
  });

  p('maden_ambari', (q, r) => {
    q.at(M_WAGON, 11.0, 65.0, { scale: 0.6, collide: true });
    q.at(M_WAGON, 20.3, 66.0, { scale: 0.6, collide: true });
    q.at(M_CRATES, 12, 64.9, { collide: true });
    q.at(M_CRATES, 15.5, 64.9, { collide: true });
    q.at(M_CRATES, 18.5, 64.9, { collide: true });
    q.at(M_SACKS, 13.5, 64.7, {});
    q.at(M_SACKS, 17, 64.7, {});
    q.at(ks('resource-stone-large'), 16, 71, { collide: true });
    q.at(ks('resource-stone-large'), 11, 71, { collide: true });
    pile(q, 14, 67.5, OFFS.slice(0, 6));
    q.row(ks('tool-pickaxe'), 11.5, 70.5, 19.5, 70.5, 4, {});
    q.at(ks('structure-metal'), 12, 66, {});
    q.at(ks('structure-metal'), 19, 66, {});
    q.at(ks('structure-metal'), 12, 71, {});
    q.at(ks('structure-metal'), 19, 71, {});
    q.list.push(...chandelier(15, 68, 6, { light: false }));
    q.row(M_CHAIN, 11, 65.2, 19, 65.2, 3, { y: 0 });
    q.row(M_STAL, 11, 64.5, 20, 64.5, 5, { scale: 0.6, tint: 0x4a3020, y: 6 });
    q.torches(r, 'n', [12, 16, 20], GOLD);
  });

  p('ray_gecidi', (q, r) => {
    q.at(dg('rubble_large'), 11, 62.3, {});
    q.at(dg('rubble_large'), 8.8, 63.3, {});
    q.at(M_WAGON, 8.7, 62.4, { scale: 0.6, rot: 20 });
    pile(q, 9.5, 61.5, OFFS.slice(0, 4));
    q.torches(r, 'n', [11.5], GOLD);
  });

  p('merkez', (q, r) => {
    // Awakening wheel (spin), chains from the wheel to the gallery corners
    q.at(M_STATUE_RING, 35.5, 51.5, { y: 11.5, scale: 3, emissive: GOLD, emissiveIntensity: 2, spin: 12, id: 'awakening_wheel' });
    for (const [x, z] of [[20, 47], [51, 47], [20, 56], [51, 56]] as [number, number][]) q.at(M_CHAIN, x, z, { y: 18 });
    // Machine housings and cart parking
    for (const [x, z] of [[22.5, 44.3], [30, 44.3], [41, 44.3], [48.5, 44.3], [21, 61], [30, 61], [41, 61], [50, 61]] as [number, number][]) {
      q.at(M_STRUCT, x, z, { scale: 1.2, tint: 0x7a7f88, collide: true, emissive: 0xffd54a, emissiveIntensity: 0.25 });
    }
    q.at(M_WAGON, 27.8, 53.0, { scale: 0.6, collide: true });
    q.at(M_WAGON, 43.6, 53.2, { scale: 0.6, collide: true });
    q.at(M_WAGON, 36.2, 59.6, { scale: 0.6, collide: true });
    // Floor grates (vents) and the lava rim rocks
    for (const [x, z] of [[22.5, 56.5], [49, 51.5], [22.5, 48], [49, 56], [28, 60.5], [43, 60.5]] as [number, number][]) {
      q.at(M_GRATE, x, z, { y: 0.03, tag: 'vent' });
    }
    for (const [x, z] of [[15.9, 44.3], [55.1, 44.3], [15.9, 61.2], [55.1, 61.2], [31, 43.8], [40, 43.8]] as [number, number][]) {
      q.at(M_ROCK, x, z, { scale: 1.0, tint: 0xff6a10, emissive: 0xff6a10, emissiveIntensity: 0.8 });
    }
    // Shrine (Kudret) recipe at (22.5, 60.3) and the two cart arrival stations
    q.at(M_ALTAR, 21.2, 60.3, { scale: 3, collide: true });
    q.at(M_ALTAR, 23.8, 60.3, { scale: 3, collide: true });
    q.at(M_ALTAR, 22.5, 59.0, { scale: 3, collide: true });
    q.at(M_CRYSTAL_P, 22.5, 60.3, { scale: 1.2, emissive: VOID, emissiveIntensity: 0.6 });
    q.at(M_SIGN, 18.5, 59.0, { rot: 90, id: 'cart_arrive_bati' });
    q.at(M_LAMP, 18.5, 57.8, {});
    q.at(M_SIGN, 52.5, 59.0, { rot: -90, id: 'cart_arrive_dogu' });
    q.at(M_LAMP, 52.5, 57.8, {});
    // Sentinels beside the north door of the Otomat Geçidi
    q.at(M_STATUE, 32.5, 43.9, { scale: 1.3, tint: 0x8a7a68, collide: true });
    q.at(M_STATUE, 38.5, 43.9, { scale: 1.3, tint: 0x8a7a68, collide: true });
    // Mine set pieces: scrap piles under the swarm of p11
    pile(q, 52.5, 54, OFFS.slice(0, 6));
    // Stalactites and hanging ladles over the flanks (ceiling 24)
    q.row(M_STAL, 18, 47, 52, 47, 12, { scale: 0.6, tint: 0x4a3020, y: 20 });
    q.row(M_STAL, 18, 56, 52, 56, 12, { scale: 0.6, tint: 0x4a3020, y: 20 });
    for (const [x, z] of [[20.5, 48.5], [20.5, 55.5], [25.5, 52], [45.5, 48.5], [50.5, 55.5], [50.5, 52]] as [number, number][]) {
      q.at(M_CAULDRON, x, z, { scale: 0.8, y: 14 });
    }
    // Galleries (Çark Galerisi, absolute 7.2), statues, banners and forge chandeliers
    for (const [x, z] of [[20, 45], [30, 45], [40, 45], [50, 45], [20, 60], [30, 60], [40, 60], [50, 60], [16.5, 50], [55.5, 52]] as [number, number][]) {
      q.at(M_STATUE, x, z, { scale: 2.4, tint: 0x8a7a68, y: 7.2 });
    }
    q.list.push(...banner(r, 'n', [24, 30, 41, 47], { model: M_BANNER_LONG, y: 3, scale: 2 }));
    q.list.push(...banner(r, 's', [24, 30, 41, 47], { model: M_BANNER_LONG, y: 3, scale: 2 }));
    for (const [x, z] of [[24, 49], [47, 49], [24, 56], [47, 56]] as [number, number][]) q.list.push(...chandelier(x, z, 16, { light: false }));
    // Torches on the north and south walls
    q.torches(r, 'n', [20, 28, 36, 44, 52], GOLD);
    q.torches(r, 's', [20, 28, 36, 44, 52], GOLD);
  });

  p('k_dogu', (q, r) => {
    q.at(M_CRYSTAL, 61.0, 49.5, { scale: 1.0, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.4 });
    q.at(M_CRYSTAL, 61.0, 53.5, { scale: 1.0, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.4 });
    q.at(M_WAGON, 58.0, 52.2, { scale: 0.6, rot: 90 });
    q.at(M_CHAIN, 57.0, 50.5, {});
    q.at(M_CHAIN, 60.0, 53.5, {});
    q.torches(r, 'n', [57.5, 60.5], GOLD);
  });

  p('k_edna', (q, r) => {
    q.at(M_GATE, 35.5, 39.7, { scale: 1.5, tint: 0x8a6a50, tag: 'gate' });
    q.list.push(...banner(r, 'w', [41.5, 43], { model: M_BANNER_A }));
    q.list.push(...banner(r, 'e', [41.5], { model: M_BANNER_A }));
    q.at(M_CHAIN, 33.5, 41.5, {});
    q.at(M_CHAIN, 37.5, 42.5, {});
    q.torches(r, 'w', [41, 43], GOLD);
    q.torches(r, 'e', [41, 43], GOLD);
  });

  p('k_bati', (q, r) => {
    q.at(M_WAGON, 13.0, 52.2, { scale: 0.6, rot: 90 });
    q.at(M_BARREL_L, 15, 50, { collide: true });
    q.at(ks('tool-pickaxe'), 11.2, 53.2, {});
    q.at(M_CHAIN, 11, 50.5, {});
    q.at(M_CHAIN, 14.5, 53.5, {});
    q.row(M_STAL, 11, 52.8, 15, 52.8, 3, { scale: 0.6, tint: 0x4a3020, y: 5 });
    q.torches(r, 'n', [12, 15], GOLD);
  });

  p('dokum_girisi', (q, r) => {
    // West wall forges, anvils, the grinder and the Usta Örsü on terrace T3 (+1.65 = 0.45 above the hall)
    q.at(M_FORGE, 0.8, 47.5, { rot: 90, scale: 1.0, collide: true });
    q.at(M_FORGE, 0.8, 52.6, { rot: 90, scale: 1.0, collide: true });
    q.at(M_FORGE, 0.8, 55.5, { rot: 90, scale: 1.0, collide: true });
    q.at(ks('workbench-anvil'), 1.5, 58.8, { collide: true });
    q.at(ks('workbench-anvil'), 2.5, 44.2, { collide: true });
    q.at(ks('workbench-grind'), 9.0, 49.5, { collide: true });
    q.at(M_ANVIL, 7.5, 58.2, { scale: 2.4, emissive: LAVA, emissiveIntensity: 0.8, y: 0.45, collide: true, id: 'usta_orsu' });
    q.row(M_BARREL_L, 9.0, 48.2, 9.0, 55.2, 2, { collide: true });
    q.at(M_BARREL_L, 1.0, 44.3, { collide: true });
    // Hanging ladles and chains (y offsets from the hall floor 1.2)
    for (const [x, z] of [[3, 48], [3, 54], [7.5, 50.5], [7, 55.5]] as [number, number][]) q.at(M_CAULDRON, x, z, { scale: 0.8, y: 7.8 });
    q.at(M_CHAIN, 4, 47, { y: 8 });
    q.at(M_CHAIN, 4, 55, { y: 8 });
    q.list.push(...chandelier(3.5, 49, 8.8, { light: true, color: LAVA }));
    q.list.push(...chandelier(3.5, 55, 8.8, { light: false }));
    // East gallery (absolute 7.0) with forge-master statues and rails
    for (const z of [48, 52, 56]) q.at(M_STATUE, 9.5, z, { scale: 2.0, y: 5.8 });
    q.row(M_RAIL, 9.5, 45.5, 9.5, 57.5, 13, { scale: 0.5, tint: 0x7a7f88, y: 5.8 });
    q.at(ks('tool-hammer'), 8.4, 46.5, {});
    q.at(ks('tool-pickaxe'), 8.6, 56.5, {});
    q.list.push(...banner(r, 'w', [47, 52, 56], { model: M_BANNER_A, y: 3 }));
    q.torches(r, 'e', [46, 50, 54, 58], GOLD);
    q.torches(r, 'w', [49, 56], GOLD);
  });

  p('k_dokum', (q, r) => {
    q.at(dg('sword_shield_gold'), 4.3, 42.6, { y: 2.5 });
    q.at(dg('sword_shield_gold'), 7.6, 42.6, { y: 2.5 });
    q.at(M_CHAIN, 4.5, 43.6, {});
    q.at(M_CHAIN, 7.2, 43.6, {});
    q.at(M_GATE, 5.5, 39.7, { scale: 1.5, tint: 0x8a2a1a, tag: 'gate' });
    q.list.push(...banner(r, 'w', [41.5], { model: M_BANNER_A }));
    q.list.push(...banner(r, 'e', [41.5], { model: M_BANNER_A }));
    q.torches(r, 'w', [42.5], GOLD);
    q.torches(r, 'e', [42.5], GOLD);
  });

  p('makinist_odasi', (q) => {
    // Boss anchors (exact coordinates, ids read by the boss script)
    const vents: [string, number, number][] = [['vent_1', 1.5, 29.5], ['vent_2', 9.5, 29.5], ['vent_3', 1.5, 37.5], ['vent_4', 9.5, 37.5]];
    for (const [id, x, z] of vents) {
      q.at(M_GRATE, x, z, { id, tag: 'vent', y: 0.03 });
      q.at(M_BRAZIER, x, z, { scale: 0.9, light: lt(EMBER, 1.2, 8, true) });
    }
    q.at(M_CRATES, 1.0, 33.5, { scale: 2.2, tint: 0x7a7f88, collide: true, id: 'scrap_block_1' });
    q.at(M_CRATES, 10.0, 33.5, { scale: 2.2, tint: 0x7a7f88, collide: true, id: 'scrap_block_2' });
    q.at(M_BOX, 5.5, 33.5, { scale: 1.5, tint: 0x7a7f88, id: 'scrap_cube', light: lt(GOLD, 1.5, 8, true) });
    q.at(M_SIGN, 5.5, 38.2, { id: 'cart_bati' });
    // Cracked cover pillars
    for (const [x, z] of [[3.5, 31.5], [7.5, 31.5], [3.5, 35.5], [7.5, 35.5]] as [number, number][]) {
      q.at(M_PILLAR, x, z, { scale: 1.6, tint: 0x8a7a68, collide: true });
    }
    // Forges along the north wall, bellows, winch ladles and the wrecked barrels
    for (const x of [2.0, 5.5, 9.0]) q.at(M_FORGE, x, 28.4, { scale: 1.4, collide: true });
    q.at(M_STRUCT, 11, 37, { scale: 1.2 });
    q.at(M_STRUCT, 0.6, 31.5, { scale: 1.2 });
    for (const [x, z] of [[2.5, 36.5], [5.5, 30.5], [8.5, 36.5], [4.5, 39.0]] as [number, number][]) q.at(M_CAULDRON, x, z, { scale: 0.8, y: 14 });
    q.at(M_CHAIN, 3, 29, { y: 8 });
    q.at(M_CHAIN, 8.5, 29, { y: 8 });
    q.at(dg('rubble_large'), 2.2, 39.0, {});
    q.at(dg('rubble_large'), 9.5, 39.0, {});
    for (const [x, z] of [[0.8, 29], [10.8, 29], [0.8, 39], [10.8, 39]] as [number, number][]) q.at(M_SCAFFOLD_BARREL, x, z, { scale: 1.0 });
    // North gallery (absolute 10.4): statues and winches
    for (const x of [2.5, 6, 9.5]) q.at(M_STATUE, x, 28.5, { scale: 2.4, tint: 0x8a7a68, y: 8.0 });
    q.list.push(...banner(rect(0, 28, 12, 12), 's', [2, 4, 8, 10], { model: M_BANNER_LONG, y: 5, scale: 2 }));
    q.list.push(...chandelier(3, 33, 16, { light: false }));
    q.list.push(...chandelier(8, 37, 16, { light: false }));
    q.row(M_STAL, 2, 30, 10, 30, 6, { scale: 0.6, tint: 0x4a3020, y: 14 });
    q.torches(rect(0, 28, 12, 12), 'w', [30, 34, 38], GOLD);
    q.torches(rect(0, 28, 12, 12), 'e', [30, 34, 38], GOLD);
  });

  p('pota_girisi', (q, r) => {
    for (const [id, x, z] of [['crucible_1', 62.4, 47.0], ['crucible_2', 62.4, 57.0], ['crucible_3', 66.5, 59.0]] as [string, number, number][]) {
      q.at(M_CAULDRON, x, z, { scale: 2.2, tag: 'crucible', id, emissive: LAVA, emissiveIntensity: 0.8, collide: true });
    }
    for (const [x, z] of [[71.1, 44], [71.1, 49], [71.1, 54.2]] as [number, number][]) {
      q.at(M_CRYSTAL, x, z, { scale: 2.0, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.6, collide: true });
    }
    for (const [x, z] of [[63.5, 50], [63.5, 53.5], [69, 58], [68.5, 42.5]] as [number, number][]) q.at(M_CRYSTAL, x, z, { scale: 1.0, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.4 });
    for (const z of [47, 51, 55]) q.at(ks('metal-panel'), 62.5, z, { rot: 90, collide: true });
    // East gallery (absolute 4.3): teal statues and rails
    for (const z of [47, 51, 55]) q.at(M_STATUE, 71.5, z, { scale: 2.0, tint: 0x5a9a98, y: 5.5 });
    q.row(M_RAIL, 71.5, 45.5, 71.5, 57.5, 13, { scale: 0.5, tint: 0x7a7f88, y: 5.5 });
    // Steam grates and hanging crucibles
    for (const [x, z] of [[65.5, 49], [65.5, 55], [68, 44.8]] as [number, number][]) q.at(M_GRATE, x, z, { y: 0.03, tag: 'vent' });
    for (const [x, z] of [[64.5, 46.5], [67.5, 56]] as [number, number][]) q.at(M_CAULDRON, x, z, { scale: 0.8, y: 7 });
    q.torches(r, 'w', [46, 52], GOLD);
  });

  p('k_pota', (q, r) => {
    for (const z of [41, 43]) {
      q.at(M_CRYSTAL, 63.6, z, { scale: 1.2, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.4, light: lt(TEAL, 1.5, 9, true) });
      q.at(M_CRYSTAL, 67.4, z, { scale: 1.2, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.4 });
    }
    q.at(M_CRYSTAL, 63.4, 39.6, { scale: 1.0, tint: TEAL, emissive: VOID, emissiveIntensity: 0.5 });
    q.at(M_CRYSTAL, 67.6, 39.6, { scale: 1.0, tint: TEAL, emissive: VOID, emissiveIntensity: 0.5 });
  });

  p('skarmorak_odasi', (q) => {
    const shards: [string, number, number][] = [
      ['shard_spot_1', 60.5, 29.5], ['shard_spot_2', 68.5, 29.5], ['shard_spot_3', 64.5, 35.5],
      ['shard_spot_4', 60.5, 36.5], ['shard_spot_5', 68.5, 36.5], ['shard_spot_6', 64.5, 27.5],
    ];
    for (const [id, x, z] of shards) q.at(M_CRYSTAL, x, z, { scale: 0.6, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.5, id, tag: 'socket' });
    q.at(M_SIGN, 64.5, 38.2, { id: 'cart_dogu' });
    q.at(M_LAMP, 64.5, 37.0, {});
    for (const [x, z] of [[58.7, 30.5], [58.7, 36], [70.3, 30.5], [70.3, 36]] as [number, number][]) {
      q.at(M_CRYSTAL, x, z, { scale: 2.2, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.5, collide: true, light: lt(TEAL, 1.5, 9, true) });
    }
    for (const [x, z] of [[59, 27], [70, 27], [70, 38.5]] as [number, number][]) q.at(M_CRYSTAL_P, x, z, { scale: 1.5, tint: VOID, emissive: VOID, emissiveIntensity: 0.6, collide: true, light: lt(VOID, 2.0, 14, true) });
    for (const [x, z] of [[58.5, 39], [70.5, 39]] as [number, number][]) q.at(M_ROCK, x, z, { scale: 1.2, collide: true });
    // North gallery (absolute 1.6): crystal statues and rails
    for (const x of [60, 64, 68]) q.at(M_STATUE, x, 26.5, { scale: 2.0, tint: 0x5a9a98, y: 4.0 });
    q.row(M_RAIL, 58.5, 26.5, 70.5, 26.5, 13, { scale: 0.5, tint: 0x7a7f88, y: 4.0 });
    q.row(M_STAL, 59, 33, 69, 33, 6, { scale: 0.6, tint: TEAL, emissive: TEAL, emissiveIntensity: 0.4, y: 15 });
  });

  p('edna_odasi', (q, r) => {
    // Boss anchors: lens pedestal, the rune-block ring at radius 5.2 (angle 0 at +x), covers and spike emitters
    q.at(M_ALTAR, 35.5, 32.5, { scale: 3.5, tint: 0xffd54a, collide: true, id: 'lens_pedestal' });
    q.ring(M_STATUE_BLOCK, 35.5, 32.5, 5.2, 8, { scale: 1, tint: 0x9a7a60, collide: true }, 'out', 90);
    for (const [x, z] of [[29, 28], [42, 28], [29, 37], [42, 37]] as [number, number][]) q.at(M_PILLAR, x, z, { scale: 1.6, tint: 0xb08868, collide: true });
    for (const [x, z] of [[27.2, 29], [27.2, 36], [43.8, 29], [43.8, 36], [30, 26.2], [41, 26.2], [30, 38.8], [41, 38.8]] as [number, number][]) {
      q.at(M_SPIKES, x, z, { y: 0.02, emissive: GOLD, emissiveIntensity: 0.4 });
    }
    // Ring gallery (absolute 8.4) with Titan statues
    for (const [x, z] of [[29, 26.5], [35.5, 26.5], [42, 26.5], [30, 39.5], [41, 39.5], [27.5, 30], [44.5, 35]] as [number, number][]) {
      q.at(M_STATUE, x, z, { scale: 2.4, tint: 0x8a7a68, y: 7.2 });
    }
    // Lens chandelier (no pooled light here: the lens glow is the light)
    q.list.push(...chandelier(35.5, 32.5, 12.5, { light: true, color: GOLD }));
    for (const [x, z] of [[31, 25.8], [40, 25.8]] as [number, number][]) q.at(M_ROCK, x, z, { scale: 1.0, tint: 0xff6a10, emissive: 0xff6a10, emissiveIntensity: 0.8, light: lt(LAVA, 1.8, 14, true) });
    q.row(M_STAL, 28, 27, 43, 27, 4, { scale: 0.6, tint: 0x4a3020, y: 15 });
    q.torches(r, 'w', [29, 33], GOLD);
    q.torches(r, 'e', [29, 33], GOLD);
  });

  p('titan_koridoru', (q, r) => {
    // Engaged pillars (flush with the walls, non-blocking), reliefs, banners and braziers
    for (const z of [18.2, 24.8]) {
      for (const x of [26, 30, 38, 44]) q.at(M_PILLAR, x, z, { scale: 1.6, tint: 0xb08868, emissive: GOLD, emissiveIntensity: 0.6 });
    }
    q.list.push(...banner(r, 'w', [20, 23], { model: M_BANNER_LONG, y: 5, scale: 2 }));
    q.list.push(...banner(r, 'e', [20, 23], { model: M_BANNER_LONG, y: 5, scale: 2 }));
    q.at(M_STATUE_HEAD, 24.3, 21, { scale: 2, tint: 0x9a7a60, rot: 90 });
    q.at(M_STATUE_HEAD, 47.2, 21, { scale: 2, tint: 0x9a7a60, rot: -90 });
    q.at(M_BRAZIER, 24.6, 25.0, { scale: 1.0, collide: true, light: lt(LAVA, 1.2, 8, true) });
    q.at(M_BRAZIER, 46.4, 24.5, { scale: 1.0, collide: true, light: lt(LAVA, 1.2, 8, true) });
    q.at(gp('statue_hooded'), 24.4, 19.2, { scale: 2.0, tint: 0x8a7a68, collide: true });
    q.at(gp('statue_hooded'), 46.8, 24.6, { scale: 2.0, tint: 0x8a7a68, collide: true });
    // Shrine (Koruma) altar
    q.at(M_ALTAR, 31.0, 24.3, { scale: 2.5, collide: true });
    // Eirich door frame with the violet leak
    q.at(M_GATE, 35.5, 17.7, { scale: 1.8, tint: 0x6a5a7a, tag: 'gate', light: lt(VOID, 1.6, 10, true) });
    q.at(M_CRYSTAL_P, 33.5, 18.2, { scale: 1.0, emissive: VOID, emissiveIntensity: 0.8 });
    q.at(M_CRYSTAL_P, 37.8, 18.2, { scale: 1.0, emissive: VOID, emissiveIntensity: 0.8 });
    // West and east galleries (absolute 4.5): two Titan guardians and rails per side
    for (const gx of [24.5, 46.5]) {
      // gallery absolute 4.5; the slope under it runs -3.6 (z 17.5) to +1.2 (z 25.5), so offsets follow the ground
      q.at(M_STATUE, gx, 20.5, { scale: 2.4, tint: 0x9a7a60, y: 4.5 + 1.8 });
      q.at(M_STATUE, gx, 23.5, { scale: 2.4, tint: 0x9a7a60, y: 4.5 - 0.0 });
      q.row(M_RAIL, gx, 18.5, gx, 25.5, 8, { scale: 0.5, tint: 0x7a7f88, y: 4.5 });
    }
    q.row(M_STAL, 26, 19, 44, 19, 6, { scale: 0.6, tint: 0x4a3020, y: 7 });
    q.row(M_STAL, 26, 24, 44, 24, 6, { scale: 0.6, tint: 0x4a3020, y: 7 });
  });

  p('fisilti_salonu', (q) => {
    // Rift sockets (exact anchors, dark frames except the two lit ones at the pull)
    RIFT_SOCKETS.forEach(([x, z], i) => {
      q.at(M_CRYSTAL_P, x, z, { scale: 2.5, emissive: VOID, emissiveIntensity: 0.4, id: `rift_spot_${i + 1}`, tag: 'rift', light: i < 2 ? lt(VOID, 2.0, 14, true) : undefined });
    });
    // Broken Awakening Wheel hanging in the void, on chains
    q.at(M_STATUE_RING, 35.5, 1.5, { y: 14, scale: 3, emissive: VOID, emissiveIntensity: 1.2, spin: 4, id: 'broken_wheel' });
    for (const [x, z] of [[33, 0.5], [38, 0.5], [33, 3], [38, 3]] as [number, number][]) q.at(M_CHAIN, x, z, { y: 14 });
    // Void-corrupted pillars at the corners and mid walls
    for (const [x, z] of [[26.5, 5.5], [44.5, 5.5], [26.5, 12.5], [44.5, 12.5], [30, 15.5], [41, 15.5]] as [number, number][]) {
      q.at(M_PILLAR, x, z, { scale: 1.6, tint: 0x3c1d5e, emissive: VOID, emissiveIntensity: 0.4, collide: true });
    }
    for (const [x, z] of [[29.5, 6.5], [41.5, 6.5], [29.5, 12], [41.5, 12]] as [number, number][]) q.at(M_CRYSTAL_P, x, z, { scale: 1.2, emissive: VOID, emissiveIntensity: 0.6 });
    // Galleries (absolute 2.4) with corrupted statues and rails
    for (const gx of [24.5, 47.5]) {
      for (const z of [4, 8, 12, 15]) q.at(M_STATUE, gx, z, { scale: 2.4, tint: 0x3c1d5e, y: 6.0 });
      q.row(M_RAIL, gx, 2.5, gx, 15.5, 8, { scale: 0.5, tint: 0x3c1d5e, y: 6.0 });
    }
    // Torn long banners on the north wall and stalactites
    q.list.push(...banner(rect(24, 0, 24, 18), 'n', [26, 30, 41, 45], { model: M_BANNER_LONG, y: 8, scale: 1.5, tint: 0x3c1d5e }));
    q.row(M_STAL, 27, 9, 44, 9, 6, { scale: 0.6, tint: 0x2a1a3a, y: 24 });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Assemble: room props from the decorator, then the dungeon definition.
// ---------------------------------------------------------------------------------------------------------------------
const ROOMS_BASE: RoomDef[] = ROOM_BASE.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] }));
const RECTS = rectsOf(ROOMS_BASE);
const CTX = makeCtx('taskasa', DOORS, PACKS, [
  { x: START[0], z: START[1], r: 1.2 },
  { x: FONT[0], z: FONT[1], r: 1.5 },
  { x: EXIT[0], z: EXIT[1], r: 1.5 },
  ...BOSSES.map((b) => ({ x: b.pos[0], z: b.pos[1], r: 1.5 })),
]);
const DECOR = decorator(CTX, RECTS);
dressRooms((id, fn) => DECOR.room(id, fn));

export const TASKASA_ROOMS: RoomDef[] = withProps(ROOMS_BASE, DECOR.out);

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(FONT[0], FONT[1]),
  shrines: [
    { type: 'shrine_power', pos: pt(22.5, 60.3) },
    { type: 'shrine_ward', pos: pt(31.0, 24.3) },
  ],
  riftSpots: [[27.5, 67.5], [22.5, 53.5], [48.5, 53.5], [66.8, 49.2], [7.5, 53.2], [35, 22]].map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(47.5, 71.8), kind: 'chest_wood' }, { pos: pt(20.5, 64.5), kind: 'chest_gold' }],
  transits: [
    // Maden arabaları: the stop pairs only. Boss gating (requiresBossDead) is not in DungeonTransitDef yet.
    { id: 'cart_bati', stops: [pt(5.5, 38.2), pt(19.5, 57.8)], speed: 14 },
    { id: 'cart_dogu', stops: [pt(64.5, 38.2), pt(51.5, 57.8)], speed: 14 },
  ],
  // Mythic+ affix-safe spots: hub chasm and bridges (r 7 tiles), the six Eirich rift sockets (r 5 tiles).
  affixSafe: [{ x: 35.5, z: 51.5, r: 7 }, ...RIFT_SOCKETS.map(([x, z]) => ({ x, z, r: 5 }))],
};

const THEME: DungeonDef['theme'] = {
  fogColor: 0x2a150d, fogNear: 12, fogFar: 56,
  ambient: 0x5a3a2c, ambientIntensity: 0.42,
  hemiSky: 0xc88a50, hemiGround: 0x1a0c08,
  torchColor: 0xffa43c, bloomStrength: 0.42, music: 'dungeon_taskasa',
  palette: [0x3a1f15, 0x6b3a24, 0xff8c1a, 0xffd54a, 0xa8301c, 0x5b5352, 0x3c1d5e, 0x3fe0c8],
  tint: 0xd8b49a,
};

export const TASKASA: DungeonDef = {
  id: 'taskasa',
  name: 'Taşkasa',
  shortName: 'Kasa',
  lore: 'Kadim Zindanların en derin kasası Taşkasa\'dır. Taşdoğanlar ölmekte olan soylarını Uyandırma Çarkı ile diriltmek istediler; çark çalışmadı, yarım kalan ayin taşın içinde bir çatlak açtı ve Boşluk oradan fısıldamaya başladı. Otomat Seda hâlâ kapıyı tutuyor, Kristal Golem Skarmorak çatlağın kristalleriyle büyüyor, Usta Makinistler Brokk ve Dorlita örsleri susturmadan çalıştırıyor. En derinde Başsözcü Eirich Boşluğu dinliyor. Kadim Anahtar Taşları bu duvarlardan yontuldu; anahtarı takan kasanın kilidini açar.',
  levelRange: [56, 60],
  timerSec: 1800,
  forcesRequired: 400,
  theme: THEME,
  grid: { w: 72, h: 84 },
  rooms: TASKASA_ROOMS,
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 180 },
  exit: { pos: shPt(EXIT[0], EXIT[1]) },
  extras: EXTRAS,
  season: 7,
  endgame: true,
  vertical: true,
};

