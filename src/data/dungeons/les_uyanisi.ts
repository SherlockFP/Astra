import type { DungeonDef, PackDef, RoomDef, TileRect } from '../../types/dungeons';
import { GEN } from '../enemyModels';
import {
  bossAt, chandelier, circleZone, decorator, dg, door, gp, kc, kf, kg, ks, lt, makeCtx, pack, pk, plateau, pt, Props, ramp, rectsOf,
  rectZone, room, shPt, stairs, withProps, banner, hw, ip,
} from './kit';

/**
 * Leş Uyanışı (`les_uyanisi`), Season Mythic+ dungeon (docs/dungeons/les_uyanisi.md, The Necrotic Wake model).
 * Layout, heights (verticality), packs, bosses, extras and set dressing. Enemy defs: src/data/enemies_les_uyanisi.ts,
 * boss scripts: src/ai/bosses/les_uyanisi.ts. Registration lines for the shared index files are reported to the orchestrator.
 *
 * Coordinates: GDD convention (continuous tile c -> world (c + 0.5) * 4). Room / door / zone rects are tile-corner based.
 * Heights: RoomDef.floorY and ceiling (clearance above the local floor), slopes (SlopeDef yFrom/yTo absolute, the doc's
 * `stairs` strips), plateaus (HeightArea) and galleries (DecorTier, absolute y). PropPlacement.y is an offset from the floor.
 *
 * Deviations (shared pieces the doc needs and this repo does not have yet, see the report): no `exile` room flag (the Dark Exile
 * room alt_kanat is kept as ALT_KANAT_RECT for the boss script and is not in ROOMS), no device / dungeon item registry (dev_gd1..3
 * are device props with ids only, the spear / hammer / orb / shield pickups are not placed), NEW hazard and prop kinds are used only
 * where the union already has them, no `atmosphere` presets in the engine (fog values are in DungeonDef.atmospheres), no
 * `nocollide` / `hang` flags (upper-layer props are placed with `y` only), NEW models use the doc's fallbacks (section 2.6, 2.7).
 * OWNER: content module.
 */

const GOLD = 0xe0b048;
const ANIMA = 0x70c8ff;
const GREEN = 0x9aff50;
const VIOLET = 0x9a60ff;
const FROST = 0x9ad8ff;

// ---------------------------------------------------------------------------------------------------------------------
// Models. NEW props (les_*) use the fallbacks of docs/dungeons/les_uyanisi.md section 2.7 until the Blender assets exist.
// ---------------------------------------------------------------------------------------------------------------------
const M_BRAZIER = gp('brazier');
const M_STATUE = gp('statue_hooded');
const M_PILLAR = dg('pillar_decorated');
const M_BROKEN_PILLAR = gp('pillar_broken');
const M_BANNER = dg('banner_patternA_white');
const M_BANNER_GOLD = dg('banner_triple_yellow');
const M_BONE_PILE = gp('bone_pile');
const M_CAULDRON = gp('cauldron');
const M_CRYSTAL = gp('crystal_blue');
const M_CRYSTAL_P = gp('crystal_purple');
const M_CHAINS = gp('chains_hanging');
const M_CRATES = dg('crates_stacked');
const M_BARREL = dg('barrel_large');
const M_SACKS = gp('sacks');
const M_WAGON = gp('wagon');
const M_ALTAR = kg('altar-stone');
const M_CAGE = gp('iron_cage');
const M_BONE_A = hw('bone_A');
const M_SKULL = hw('skull');
const M_TABLE = dg('table_long');

/** Fallbacks of the NEW props (section 2.7 table). Model path + scale + tint; swap for the GLB when it exists. */
const FB = {
  son_can: { model: M_CAULDRON, scale: 3, tint: 0xb08040 },                         // les_son_can (inverted cauldron as the bell)
  cesaret_eli: { model: kg('column-large'), scale: 1.6, tint: 0xf0e4c8 },            // les_cesaret_eli (column cluster, one shape)
  gokbekci: { model: GEN('golem_stone'), scale: 1.3, tint: 0xf0e0b0 },                // les_gokbekci_dev (creature asset as a prop)
  kemik_dikeni: { model: hw('fence_broken'), scale: 1, tint: 0xd8d0b8 },              // les_kemik_dikeni
  et_kancasi: { model: ip('psx-dungeon', 'chain'), scale: 1, tint: 0xc8b8a0 },        // les_et_kancasi
  ameliyat_masasi: { model: dg('table_long'), scale: 1, tint: 0xa8a890 },             // les_ameliyat_masasi
  vana: { model: dg('barrel_large'), scale: 1.5, tint: GREEN },                       // les_vana (emissive green)
  zol_sutun: { model: ip('psx-dungeon', 'pillar'), scale: 1.4, tint: 0xb8b098 },      // les_zolramus_sutunu
  buz_kristal: { model: M_CRYSTAL, scale: 2.2, tint: FROST },                         // les_buz_kristali (6 m)
  buz_taht: { model: M_ALTAR, scale: 1, tint: 0xa0d0ff },                             // les_buz_taht
  heykel_yarim: { model: M_STATUE, scale: 1, tint: 0xe8e0c8 },                        // les_heykel_yarim
  kemik_kopru: { model: ip('psx-dungeon', 'arch'), scale: 1, tint: 0xc8c0d0 },        // les_kemik_kopru
  balkon: { model: dg('wall_archedwindow_open'), scale: 1, tint: 0xd8d0b8 },          // les_balkon
  kemik_avize: { model: ip('psx-dungeon', 'chandelier'), scale: 1, tint: VIOLET },    // les_kemik_avize
  ameliyat_lambasi: { model: ip('psx-dungeon', 'chandelier'), scale: 0.6, tint: 0xd8ff80 }, // les_ameliyat_lambasi
} as const;

/** Shorthand for a rect in tile-corner units. */
const rect = (x: number, z: number, w: number, h: number): TileRect => ({ x, z, w, h });

// ---------------------------------------------------------------------------------------------------------------------
// Rooms (base data). Floors and walls per section 3.2; the Dark Exile room is kept out of this list (see header).
// ---------------------------------------------------------------------------------------------------------------------
const ROOM_BASE: RoomDef[] = [
  room('giris', 'Cesaret Kapısı', 4, 54, 8, 8, 'tiles', 'stone', 0.3, { floorY: 0, openAir: true, ceiling: 10 }),
  room('k_giris', 'Nöbetçi Yolu', 12, 57, 4, 2, 'tiles', 'stone', 0.4, { floorY: 1.2, ceiling: 8 }),
  room('meydan', 'Cesaret Meydanı', 16, 48, 14, 14, 'tiles', 'stone', 0.5, { floorY: 0, openAir: true, ceiling: 9 }),
  room('ambar', 'Hasat Ambarı', 20, 42, 8, 6, 'wood', 'brick', 0.6, { optional: true, floorY: 0, ceiling: 7 }),
  room('k_hasat', 'Hasat Yolu', 30, 54, 4, 2, 'dirt', 'cave', 0.4, { floorY: 0, ceiling: 9 }),
  room('hasat_cukuru', 'Hasat Çukuru', 34, 46, 14, 14, 'dirt', 'cave', 0.15, { boss: 1, floorY: -5.2, openAir: true, ceiling: 6 }),
  room('k_toll_a', 'Çürük Merdiven', 40, 42, 2, 4, 'stone', 'brick', 0.3, { ceiling: 8 }),
  room('toll_kapisi', 'Çan Kapısı', 36, 36, 10, 6, 'stone', 'brick', 0.5, { floorY: 1.4, ceiling: 12 }),
  room('son_can', 'Son Çan Avlusu', 30, 24, 22, 12, 'stone', 'brick', 0.5, { floorY: 2.4, openAir: true, ceiling: 16 }),
  room('can_kulesi', 'Çan Kulesi', 52, 29, 8, 8, 'stone', 'brick', 0.5, { optional: true, floorY: 2.4, ceiling: 18 }),
  room('k_toll_b', 'Yıkık Geçit', 26, 29, 4, 2, 'stone', 'stone', 0.3, { ceiling: 8 }),
  room('kisayol', 'Servis Geçidi', 26, 36, 10, 2, 'stone_dark', 'stone', 0.3, { skip: true, ceiling: 7 }),
  room('dus_meydan', "Cesaret'in Düşüşü", 6, 22, 20, 16, 'tiles', 'stone', 0.15, { boss: 2, floorY: 6.0, openAir: true, ceiling: 18 }),
  room('k_kopru', 'Kemik Köprü', 12, 18, 6, 4, 'stone_dark', 'temple', 0.1, { ceiling: 10 }),
  room('dikis_kapi', 'Dikişhane Girişi', 8, 10, 16, 8, 'stone_dark', 'forge', 0.5, { floorY: 14.8, ceiling: 14 }),
  room('vana_odasi', 'Yaratım Odası', 0, 10, 8, 8, 'stone_dark', 'forge', 0.5, { optional: true, floorY: 14.8, ceiling: 9 }),
  room('kan_havuzu', 'Kan Havuzu', 8, 2, 12, 8, 'stone_dark', 'forge', 0.5, { optional: true, floorY: 14.8, ceiling: 12 }),
  room('k_atolye', 'Ameliyat Koridoru', 24, 12, 4, 2, 'stone_dark', 'forge', 0.3, { ceiling: 7 }),
  room('dikis_atolye', 'Dikiş Atölyesi', 28, 2, 18, 14, 'stone_dark', 'forge', 0.1, { boss: 3, floorY: 17.4, ceiling: 18 }),
  room('k_yukari', 'Yukarı Merdiven', 46, 8, 4, 2, 'stone_dark', 'temple', 0.3, { ceiling: 10 }),
  room('zolramus_kapi', 'Zolramus Kapısı', 50, 2, 14, 14, 'stone_dark', 'temple', 0.5, { floorY: 22.6, ceiling: 24 }),
  room('k_nef_a', 'Kemik Basamaklar', 56, 16, 2, 4, 'stone_dark', 'temple', 0.3, { ceiling: 14 }),
  room('kemik_nef', 'Kemik Nef', 52, 20, 16, 8, 'stone_dark', 'temple', 0.5, { floorY: 27.8, ceiling: 28 }),
  room('heykel_galerisi', 'Heykeltıraş Galerisi', 68, 16, 12, 16, 'stone_dark', 'temple', 0.5, { floorY: 30.6, ceiling: 22 }),
  room('k_cikis', 'Buzlu Merdiven', 72, 32, 2, 4, 'ice', 'ice', 0.1, { ceiling: 12 }),
  room('buz_tepe', 'Buzlu Tepe', 62, 36, 18, 18, 'ice', 'ice', 0.1, { boss: 4, floorY: 36.0, openAir: true }),
];

/** Boss 1 and 2 arena sizes are read from the room rects; this is the Dark Exile room, kept for the boss script only. */
export const ALT_KANAT_RECT: TileRect = rect(50, 44, 10, 14);

/** Fog presets (section 2.3, fog colour / near / far). Rooms name one with `RoomDef.atmosphere`. */
const ATMOSPHERES: NonNullable<DungeonDef['atmospheres']> = {
  forecourt: { color: 0xd8e6f2, near: 22, far: 90 },
  plague: { color: 0x8a8a50, near: 10, far: 46 },
  toll: { color: 0x6e7a62, near: 12, far: 56 },
  fall: { color: 0xcbba9e, near: 20, far: 85 },
  cloud: { color: 0xdcdce4, near: 6, far: 34 },
  stitch: { color: 0x1c2218, near: 8, far: 38 },
  zol: { color: 0x1a1424, near: 8, far: 40 },
  top: { color: 0xb8d8f0, near: 16, far: 70 },
  exile: { color: 0x203858, near: 6, far: 30 },
};

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: {
    atmosphere: 'forecourt', ambientVfx: 'ambient_dust', lightColor: 0xffd070,
    zones: [circleZone('rune', 8, 56, 1.0, { color: GOLD, glow: GOLD, glowIntensity: 0.4 })],
    slopes: [stairs(rect(9, 57, 3, 2), 'x', 0, 1.2, { id: 'kemer_basamaklari' })],
    heightAreas: [plateau(rect(6, 54, 4, 4), 0.4, 'none', 'font_terrace')],
  },
  k_giris: { atmosphere: 'forecourt' },
  meydan: {
    atmosphere: 'forecourt', ambientVfx: 'ambient_dust',
    zones: [
      circleZone('pool', 22.5, 54.5, 2.0, { blocked: true, color: 0x3a78c8, glow: ANIMA, glowIntensity: 0.9 }),
      circleZone('dais', 17.5, 55.5, 1.5, { blocked: false, y: 0.4, color: 0x3a2a18, glow: GOLD, glowIntensity: 0.4 }),
    ],
    slopes: [stairs(rect(16, 57, 4, 2), 'x', 1.2, 0, { id: 'meydan_basamaklari' })],
  },
  ambar: { atmosphere: 'plague' },
  k_hasat: { atmosphere: 'plague' },
  hasat_cukuru: {
    explicitDecor: true, atmosphere: 'plague', ambientVfx: 'ambient_shadow_wisps', lightColor: GREEN,
    zones: [
      circleZone('pit', 45.5, 52.5, 1.8, { blocked: true, fall: 'kill', depth: 3, color: 0x2a3a10, glow: GREEN, glowIntensity: 0.6, y: -1.5 }),
      rectZone('vent', 36, 48, 2, 2, { blocked: false, color: 0x2a3a10, glow: GREEN, glowIntensity: 0.4 }),
      rectZone('vent', 43, 57, 2, 2, { blocked: false, color: 0x2a3a10, glow: GREEN, glowIntensity: 0.4 }),
      rectZone('vent', 36, 57, 2, 2, { blocked: false, color: 0x2a3a10, glow: GREEN, glowIntensity: 0.4 }),
    ],
    slopes: [
      ramp(rect(34, 54, 6, 2), 'x', 0, -5.2, { id: 'cukur_rampasi' }),
      stairs(rect(40, 46, 2, 4), 'z', -1.6, -5.2, { id: 'cukur_cikis_merdiveni' }),
    ],
  },
  k_toll_a: {
    slopes: [stairs(rect(40, 42, 2, 4), 'z', 1.4, -1.6, { id: 'curuk_merdiven' })],
  },
  toll_kapisi: { atmosphere: 'toll' },
  son_can: {
    explicitDecor: true, atmosphere: 'toll', ambientVfx: 'ambient_dust',
    zones: [
      circleZone('dais', 41, 29.5, 2.0, { blocked: false, y: 0.4, color: 0x4a4030, glow: GOLD, glowIntensity: 0.3 }),
      circleZone('dais', 41, 29.5, 1.0, { blocked: false, y: 0.8, color: 0x4a4030, glow: GOLD, glowIntensity: 0.5 }),
    ],
    hazards: [{ kind: 'debris_fall', interval: 9, warn: 1.4, radius: 2.5, coef: 1.6 }],
    slopes: [stairs(rect(40, 33, 3, 3), 'z', 2.4, 1.4, { id: 'can_basamaklari' })],
  },
  can_kulesi: {
    atmosphere: 'toll',
    heightAreas: [plateau(rect(56, 29, 4, 4), 5.4, 'rail', 'kule_terasi')],
    slopes: [stairs(rect(53, 29, 3, 4), 'x', 2.4, 5.4, { id: 'kule_merdiveni' })],
  },
  k_toll_b: {
    slopes: [stairs(rect(26, 29, 4, 2), 'x', 6.0, 2.4, { id: 'yikik_gecit_rampasi' })],
  },
  kisayol: {
    atmosphere: 'fall',
    slopes: [stairs(rect(26, 36, 10, 2), 'x', 6.0, 1.4, { id: 'servis_rampasi' })],
  },
  dus_meydan: {
    explicitDecor: true, atmosphere: 'fall',
    zones: [
      circleZone('dais', 15.5, 29.5, 3.5, { blocked: false, y: 0.45, color: 0x5a4a30, glow: GOLD, glowIntensity: 0.6 }),
      circleZone('rune', 8, 24, 1.2, { color: GOLD, glow: GOLD, glowIntensity: 0.5 }),
      circleZone('rune', 23, 24, 1.2, { color: GOLD, glow: GOLD, glowIntensity: 0.5 }),
      circleZone('rune', 8, 36, 1.2, { color: GOLD, glow: GOLD, glowIntensity: 0.5 }),
      circleZone('rune', 23, 36, 1.2, { color: GOLD, glow: GOLD, glowIntensity: 0.5 }),
    ],
    slopes: [stairs(rect(12, 22, 5, 4), 'z', 9.6, 6.0, { id: 'cesaret_merdivenleri' })],
  },
  k_kopru: {
    atmosphere: 'cloud', ambientVfx: 'ambient_shadow_wisps',
    zones: [
      rectZone('void', 12, 18, 2, 4, { blocked: true, fall: 'open', depth: 20, look: 'cloud', color: 0xdcdce4 }),
      rectZone('void', 16, 18, 2, 4, { blocked: true, fall: 'open', depth: 20, look: 'cloud', color: 0xdcdce4 }),
    ],
    slopes: [stairs(rect(14, 18, 2, 4), 'z', 14.8, 9.6, { id: 'kemik_kopru_guverte' })],
  },
  dikis_kapi: {
    explicitDecor: true, atmosphere: 'stitch', ambientVfx: 'ambient_shadow_wisps', lightColor: GREEN,
    zones: [circleZone('rune', 8.5, 16, 1.0, { color: 0x1a2a10, glow: GREEN, glowIntensity: 0.5 })],
    hazards: [{ kind: 'plague_vent', interval: 8, warn: 1.2, radius: 2, coef: 0.6, vfx: 'poison_cloud' }],
  },
  vana_odasi: { atmosphere: 'stitch' },
  kan_havuzu: {
    atmosphere: 'stitch',
    zones: [rectZone('pool', 12, 3, 6, 3, { blocked: true, color: 0x6a1a1a, glow: 0xaa2020, glowIntensity: 0.5 })],
  },
  k_atolye: {
    atmosphere: 'stitch',
    slopes: [stairs(rect(24, 12, 4, 2), 'x', 14.8, 17.4, { id: 'ameliyat_rampasi' })],
  },
  dikis_atolye: {
    explicitDecor: true, atmosphere: 'stitch', ambientVfx: 'ambient_shadow_wisps', lightColor: GREEN,
    zones: [
      circleZone('pit', 36.5, 5.5, 3.2, { blocked: true, fall: 'kill', depth: 4, color: 0x0e1a0a, glow: GREEN, glowIntensity: 0.4 }),
      rectZone('bridge', 31, 5, 11, 1, { blocked: false, y: 17.4, color: 0x3a3428, glow: GREEN, glowIntensity: 0.3 }),
      circleZone('dais', 36.5, 5.5, 2.0, { blocked: false, y: 17.4, color: 0x3a3428, glow: GREEN, glowIntensity: 0.3 }),
      circleZone('rune', 31, 10, 1.1, { color: 0x1a2a10, glow: GREEN, glowIntensity: 0.5 }),
      circleZone('rune', 36.5, 11.5, 1.1, { color: 0x1a2a10, glow: GREEN, glowIntensity: 0.5 }),
      circleZone('rune', 42, 10, 1.1, { color: 0x1a2a10, glow: GREEN, glowIntensity: 0.5 }),
    ],
  },
  k_yukari: {
    atmosphere: 'zol', ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    slopes: [stairs(rect(46, 8, 4, 2), 'x', 17.4, 22.6, { id: 'yukari_merdiven' })],
  },
  zolramus_kapi: {
    atmosphere: 'zol', ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    zones: [circleZone('rune', 57, 9, 2.0, { color: 0x2a1a40, glow: VIOLET, glowIntensity: 0.6 })],
  },
  k_nef_a: {
    atmosphere: 'zol',
    slopes: [stairs(rect(56, 16, 2, 4), 'z', 22.6, 27.8, { id: 'kemik_basamaklar' })],
  },
  kemik_nef: {
    explicitDecor: true, atmosphere: 'zol', ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    zones: [circleZone('rune', 60, 24, 2.0, { color: 0x2a1a40, glow: VIOLET, glowIntensity: 0.6 })],
    slopes: [stairs(rect(64, 20, 4, 8), 'x', 27.8, 30.6, { id: 'heykeltiras_merdiveni' })],
  },
  heykel_galerisi: {
    explicitDecor: true, atmosphere: 'zol', ambientVfx: 'ambient_shadow_wisps', lightColor: VIOLET,
    heightAreas: [plateau(rect(68, 29, 12, 3), 32.4, 'none', 'galeri_tier')],
    slopes: [stairs(rect(68, 26, 12, 3), 'z', 30.6, 32.4, { id: 'galeri_basamaklari' })],
  },
  k_cikis: {
    atmosphere: 'top', ambientVfx: 'ambient_snow',
    slopes: [stairs(rect(72, 32, 2, 4), 'z', 32.4, 36.0, { id: 'buzlu_merdiven' })],
  },
  buz_tepe: {
    explicitDecor: true, atmosphere: 'top', ambientVfx: 'ambient_snow',
    zones: [
      rectZone('void', 62, 36, 18, 18, { blocked: true, fall: 'open', depth: 20, look: 'cloud', color: 0xdcdce4 }),
      rectZone('bridge', 72, 36, 2, 2, { blocked: false, color: 0xbfe0ff }),
      circleZone('dais', 70.5, 44.5, 7.5, { blocked: false, y: 0, color: FROST, glow: 0x80d0ff, glowIntensity: 0.5 }),
      circleZone('dais', 70.5, 46, 3.0, { blocked: false, y: 0.4, color: FROST, glow: 0x80d0ff, glowIntensity: 0.4 }),
    ],
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Doors (tile on the shared edge in room a). The doc's section 3.3 list; height steps per door are within 0.05 m.
// ---------------------------------------------------------------------------------------------------------------------
const DOORS = [
  door('giris', 'k_giris', 11, 57, 'e', 2, 'none'),
  door('k_giris', 'meydan', 15, 57, 'e', 2, 'none'),
  door('meydan', 'ambar', 22, 48, 'n', 2, 'none'),
  door('meydan', 'k_hasat', 29, 54, 'e', 2, 'none'),
  door('k_hasat', 'hasat_cukuru', 33, 54, 'e', 2, 'boss_lock'),
  door('hasat_cukuru', 'k_toll_a', 40, 46, 'n', 2, 'boss_exit'),
  door('k_toll_a', 'toll_kapisi', 40, 42, 'n', 2, 'none'),
  door('toll_kapisi', 'son_can', 40, 36, 'n', 2, 'none'),
  door('son_can', 'can_kulesi', 51, 30, 'e', 2, 'none'),
  door('son_can', 'k_toll_b', 30, 29, 'w', 2, 'none'),
  door('k_toll_b', 'dus_meydan', 26, 29, 'w', 2, 'boss_lock'),
  { ...door('toll_kapisi', 'kisayol', 36, 36, 'w', 2, 'device_lock'), device: 'dev_gd2' },
  door('kisayol', 'dus_meydan', 26, 36, 'w', 2, 'boss_lock'),
  door('dus_meydan', 'k_kopru', 14, 22, 'n', 2, 'boss_exit'),
  door('k_kopru', 'dikis_kapi', 14, 18, 'n', 2, 'none'),
  door('dikis_kapi', 'vana_odasi', 8, 13, 'w', 2, 'none'),
  door('dikis_kapi', 'kan_havuzu', 12, 10, 'n', 2, 'none'),
  door('dikis_kapi', 'k_atolye', 23, 12, 'e', 2, 'none'),
  door('k_atolye', 'dikis_atolye', 27, 12, 'e', 2, 'boss_lock'),
  door('dikis_atolye', 'k_yukari', 45, 8, 'e', 2, 'boss_exit'),
  door('k_yukari', 'zolramus_kapi', 49, 8, 'e', 2, 'none'),
  door('zolramus_kapi', 'k_nef_a', 56, 15, 's', 2, 'none'),
  door('k_nef_a', 'kemik_nef', 56, 19, 's', 2, 'none'),
  door('kemik_nef', 'heykel_galerisi', 67, 23, 'e', 2, 'none'),
  door('heykel_galerisi', 'k_cikis', 72, 31, 's', 2, 'none'),
  door('k_cikis', 'buz_tepe', 72, 35, 's', 2, 'boss_lock'),
];

// ---------------------------------------------------------------------------------------------------------------------
// Enemy ids (defined in src/data/enemies_les_uyanisi.ts; the `les_` prefix avoids collisions).
// ---------------------------------------------------------------------------------------------------------------------
const KS = 'les_kirik_savasci';
const KB = 'les_kirik_buyucu';
const AR = 'les_arbaletci';
const VT = 'les_veba_torbasi';
const CN = 'les_canavar';
const DO = 'les_dikisli_onder';
const LT = 'les_les_toplayici';
const EZ = 'les_et_zanaatkari';
const ZB = 'les_zol_bekci';
const ZS = 'les_zol_buyucu';
const ZH = 'les_zol_heykeltiras';
const ZF = 'les_zol_sifaci';
const KF = 'les_kafatasi';

// ---------------------------------------------------------------------------------------------------------------------
// Packs (section 4.3). `pk(id, room, cx, cz, forces, front, back, extra)`; forces are the sums of the member forces.
// ---------------------------------------------------------------------------------------------------------------------
const PACKS: PackDef[] = [
  pack('les_p01', 'k_giris', 13.5, 57.5, undefined, [[KS, -1, 0], [KS, 0, 0], [KB, 1, 0]]),
  pk('les_p02', 'meydan', 19, 52, 13, [[KS, 3]], [[KB, 1]]),
  pk('les_p03', 'meydan', 22.5, 50, 14, [[KS, 2]], [[AR, 2]]),
  pk('les_p04', 'meydan', 26.5, 57, 14, [[KS, 2]], [[KB, 1], [AR, 1]]),
  pack('les_p05', 'meydan', 17.5, 60.8, 5, [[VT, 0.3, 0]], { patrol: [[17.5, 60.8], [29, 60.8], [29, 61.1], [17.5, 61.1]] }),
  pk('les_p06', 'meydan', 23, 57.5, 15, [[CN, 1], [KS, 1]], [], { big: true }),
  pack('les_p07', 'k_hasat', 32, 54.5, undefined, [[KS, -1.5, 0], [KS, -0.5, 0], [AR, 0.5, 0]]),
  pk('les_p08', 'ambar', 21.5, 44.5, 17, [[KS, 3]], [[KB, 1], [AR, 1]], { optional: true }),
  pk('les_p09', 'ambar', 25.5, 45, 16, [[CN, 1]], [[KB, 1]], { optional: true }),
  pk('les_p10', 'k_toll_a', 40.5, 43.5, 11, [[KS, 1]], [[KB, 1], [AR, 1]]),
  pk('les_p11', 'toll_kapisi', 39.5, 39, 14, [[KS, 2]], [[AR, 2]]),
  pack('les_p12', 'toll_kapisi', 44.5, 39.5, undefined, [[KS, 0.3, 0.8], [KS, -0.4, 0.8], [KB, 0.3, -0.8], [KB, -0.4, -0.8]]),
  pk('les_p13', 'son_can', 34, 28, 17, [[KS, 3]], [[KB, 1], [AR, 1]]),
  pack('les_p14', 'son_can', 40.5, 33.5, undefined, [[CN, 0.3, 1.2], [KB, 0.3, -1.2], [KB, -0.39, -0.86]], { big: true }),
  pk('les_p15', 'son_can', 47, 27, 18, [[KS, 2]], [[AR, 2], [KB, 1]]),
  pack('les_p16', 'son_can', 33, 33, 5, [[VT, 0.3, 0]], { patrol: [[32.5, 33], [36.5, 33], [36.5, 34], [32.5, 34]] }),
  pk('les_p17', 'can_kulesi', 54.5, 33, 22, [[CN, 1], [KS, 2]], [[AR, 1]], { optional: true }),
  pack('les_p18', 'k_toll_b', 27.6, 29.5, undefined, [[KS, -1.2, 0], [KS, -0.4, 0], [KB, 0.4, 0], [AR, 1.2, 0]]),
  pack('les_p19', 'k_kopru', 15, 19.5, undefined, [[KB, -0.9, 0], [AR, -0.3, -0.6], [AR, 0.1, 0.5]]),
  pk('les_p20', 'dikis_kapi', 11, 14, 25, [[DO, 3]], [[LT, 1], [EZ, 1]], { big: true }),
  pk('les_p21', 'dikis_kapi', 17.5, 12, 25, [[DO, 2]], [[LT, 2], [EZ, 1]], { big: true }),
  pk('les_p22', 'dikis_kapi', 21, 14.8, 10, [[VT, 2]], [], { patrol: [[21, 14.8], [23, 14.8], [23, 16.6], [21, 16.6]] }),
  pack('les_p23', 'k_atolye', 26, 12.5, undefined, [[DO, -1.6, 0], [DO, -0.8, 0], [LT, 0, 0], [EZ, 0.8, 0]]),
  pk('les_p24', 'vana_odasi', 3.5, 12, 20, [[DO, 3]], [[EZ, 1]], { optional: true, dormant: { kind: 'egg', wakeRadius: 6 } }),
  pk('les_p25', 'kan_havuzu', 10, 7, 25, [[DO, 2]], [[LT, 2], [EZ, 1]], { optional: true }),
  pk('les_p26', 'zolramus_kapi', 53, 6, 17, [[ZB, 1]], [[ZS, 2]]),
  pk('les_p27', 'zolramus_kapi', 60, 6, 17, [[ZB, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p28', 'zolramus_kapi', 56.5, 11.5, 15, [[ZH, 1]], [[ZS, 1]]),
  pk('les_p29', 'k_nef_a', 56.5, 17.5, 10, [], [[ZS, 1], [ZF, 1]]),
  pk('les_p30', 'kemik_nef', 55, 23.5, 17, [[ZB, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p31', 'kemik_nef', 62, 23.5, 17, [[ZH, 1], [ZB, 1]], [], { big: true }),
  pk('les_p32', 'heykel_galerisi', 71, 20, 20, [[ZH, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p33', 'heykel_galerisi', 76, 23.5, 17, [[ZB, 1]], [[ZS, 1], [ZF, 1]]),
  pk('les_p34', 'heykel_galerisi', 77, 29.5, 15, [[ZH, 1]], [[ZS, 1]]),
  pk('les_p35', 'k_cikis', 72.5, 33.5, 10, [], [[ZS, 2]]),
  pk('les_p36', 'zolramus_kapi', 62, 12, 10, [[KF, 5]], []),
];

// ---------------------------------------------------------------------------------------------------------------------
// Bosses (section 5 placements). Order 1 to 4, strict.
// ---------------------------------------------------------------------------------------------------------------------
const BOSSES = [
  bossAt('les_boss_curukkemik', 'hasat_cukuru', 42, 52.5, -90, 1),
  bossAt('les_boss_hasatci_amarth', 'dus_meydan', 13, 29.5, 90, 2),
  bossAt('les_boss_cerrah_dikisat', 'dikis_atolye', 36.5, 5.5, 0, 3),
  bossAt('les_boss_ayazbaglayan_nalthor', 'buz_tepe', 70.5, 46, 180, 4),
];

const START: [number, number] = [5.5, 58];
const FONT: [number, number] = [8, 56];
const EXIT: [number, number] = [66.5, 49.5];
const DEV_GD: [number, number, number][] = [[17.5, 55.5, 1], [36.6, 39.6, 2], [8, 36, 3]];

// ---------------------------------------------------------------------------------------------------------------------
// Set dressing (section 3.7, reduced to the anchors and a readable subset). Props use GDD coordinates through Props.
// ---------------------------------------------------------------------------------------------------------------------
function dressRooms(p: (id: string, fn: (q: Props, r: TileRect) => void) => void): void {
  p('giris', (q) => {
    q.at(M_STATUE, 9.8, 60.2, { scale: 1.4, tint: 0xf0e0b0, collide: true, rot: 90 });
    q.at(M_STATUE, 11.2, 60.2, { scale: 1.4, tint: 0xf0e0b0, collide: true, rot: -90 });
    q.at(M_BRAZIER, 7.5, 55.5, { scale: 1.2, collide: true, light: lt(GOLD, 1.6, 9, true) });
    q.at(M_BRAZIER, 9, 55.5, { scale: 1.2, collide: true, light: lt(GOLD, 1.6, 9, true) });
    q.at(kc('siege-ballista-demolished'), 6, 61, { scale: 1, rot: 35 });
    q.at(kg('column-large'), 5, 56, { scale: 1, tint: 0xf0e4c8, collide: true });
    q.at(dg('sword_shield_gold'), 4.3, 58, { y: 2.6 });
    q.at(dg('sword_shield_gold'), 4.3, 60, { y: 2.6 });
    q.list.push(...banner(rect(4, 54, 8, 8), 'w', [56, 60], { model: M_BANNER_GOLD, y: 5 }));
    q.at(M_BONE_A, 10.5, 61, { scale: 1 });
  });

  p('k_giris', (q) => {
    q.torches(rect(12, 57, 4, 2), 'n', [13, 15], GOLD);
  });

  p('meydan', (q) => {
    // The working Gökbekçi Devi (device dev_gd1) and two collapsed decorative golems
    const dev = DEV_GD[0];
    q.at(FB.gokbekci.model, dev[0], dev[1], { scale: FB.gokbekci.scale, tint: FB.gokbekci.tint, collide: true, id: 'dev_gd1', tag: 'device', device: 'dev_gd1' });
    q.at(FB.gokbekci.model, 26.5, 51.5, { scale: FB.gokbekci.scale, tint: 0x8a8a88, rot: -90, y: -0.3 });
    // Fountain (anima) at the pool centre
    q.at(kf('fountain-round'), 22.5, 54.5, { scale: 3, collide: false });
    q.at(M_CRYSTAL, 22.5, 54.5, { y: 2.2, scale: 0.6, tint: ANIMA, light: lt(ANIMA, 1.4, 8, true) });
    // Market ruin and fallen wardens
    q.at(gp('market_stall'), 20.5, 59.5, { rot: 20, scale: 1 });
    q.at(gp('market_stall'), 28, 59, { rot: -15, scale: 1 });
    q.at(M_WAGON, 27, 47.5, { rot: 60, scale: 1, collide: true });
    q.at(M_BONE_PILE, 26.4, 47.8, { scale: 2, tint: 0xd8d0b8 });
    q.at(M_SACKS, 21, 61.6, {});
    q.at(M_SKULL, 24, 60.3, {});
    q.at(M_SKULL, 28.5, 58, {});
    q.at(M_BONE_A, 19.5, 58.5, { rot: 30 });
    q.at(M_BONE_A, 29.5, 53.5, { rot: -40 });
    // Pillars, braziers (green when plague, gold here), banners
    q.at(M_PILLAR, 16.5, 49.5, { scale: 1.2, collide: true, tint: 0xd8d0b8 });
    q.at(M_PILLAR, 29.5, 49.5, { scale: 1.2, collide: true, tint: 0xd8d0b8 });
    q.at(M_BRAZIER, 18.5, 49.5, { scale: 1.2, collide: true, light: lt(GREEN, 1.6, 8, true) });
    q.at(M_BRAZIER, 27.5, 49.5, { scale: 1.2, collide: true, light: lt(GREEN, 1.6, 8, true) });
    q.list.push(...banner(rect(16, 48, 14, 14), 'n', [19, 23, 27], { model: M_BANNER, y: 6, tint: 0x4a2870 }));
    q.torches(rect(16, 48, 14, 14), 'e', [50, 54], GOLD);
  });

  p('ambar', (q) => {
    q.row(M_BARREL, 23.5, 43.2, 27.5, 43.2, 3, { collide: true, tint: 0x90b060 });
    q.at(M_CRATES, 26.5, 47, { collide: true });
    q.at(M_SACKS, 22.5, 47, {});
    q.at(dg('shelf_large'), 20.5, 45.5, { rot: 90, collide: true });
    q.at(hw('coffin'), 24.5, 46.5, { y: 0 });
    q.at(hw('coffin'), 24.5, 46.5, { y: 0.9, rot: 15 });
    q.at(dg('chest'), 26.4, 43.4, { id: 'chest_ambar' });
    q.torches(rect(20, 42, 8, 6), 'n', [22, 26], GOLD);
  });

  p('hasat_cukuru', (q) => {
    // Pit walls: spike ring, corpse heaps, hooks, cauldrons, the well is a blocked zone (45.5, 52.5)
    for (const [x, z] of [[35, 47], [35, 52], [35, 58], [40, 59], [47.5, 49], [47.5, 56]] as [number, number][]) {
      q.at(FB.kemik_dikeni.model, x, z, { scale: 1.6, tint: FB.kemik_dikeni.tint, rot: x > 40 ? 90 : 0 });
    }
    q.at(M_BONE_PILE, 37, 49.5, { scale: 2, tint: 0xd8d0b8 });
    q.at(M_BONE_PILE, 41, 58.5, { scale: 2, tint: 0xd8d0b8 });
    q.at(M_BONE_PILE, 47, 47.5, { scale: 2, tint: 0xd8d0b8 });
    q.at(hw('ribcage'), 36.5, 55, { scale: 1.3 });
    q.at(hw('coffin'), 38.5, 50.6, { rot: 80 });
    q.at(M_CAULDRON, 37.2, 57, { scale: 1.3, tint: 0x9aff50, light: lt(GREEN, 1.2, 6, true) });
    q.at(M_CAULDRON, 46.5, 58.5, { scale: 1.3, tint: 0x9aff50, light: lt(GREEN, 1.2, 6, true) });
    q.at(FB.et_kancasi.model, 39, 48, { scale: 1.2, y: 3.4, tint: FB.et_kancasi.tint });
    q.at(FB.et_kancasi.model, 45, 59, { scale: 1.2, y: 3.4, tint: FB.et_kancasi.tint });
    q.at(M_CHAINS, 47, 50, { y: 0 });
    q.at(hw('tree_dead_large'), 36, 59, { scale: 1.2 });
    q.at(hw('tree_dead_large'), 46, 46.8, { scale: 1.2 });
    q.at(gp('well'), 47.5, 52.5, { collide: false, scale: 1.2 });
    q.torches(rect(34, 46, 14, 14), 'n', [38, 44], GREEN);
  });

  p('k_toll_a', (q) => {
    q.at(M_BROKEN_PILLAR, 41.5, 45, { scale: 1, collide: true });
    q.at(M_BONE_PILE, 40.5, 43.5, { scale: 1.2, tint: 0xd8d0b8 });
  });

  p('toll_kapisi', (q) => {
    // Gatehouse: the wrecked siege machines, the Devi dev_gd2 by the west wall (the device_lock door)
    const dev = DEV_GD[1];
    q.at(FB.gokbekci.model, dev[0], dev[1], { scale: FB.gokbekci.scale, tint: FB.gokbekci.tint, collide: true, id: 'dev_gd2', tag: 'device', device: 'dev_gd2' });
    q.at(kc('siege-catapult-demolished'), 43.5, 40, { scale: 1 });
    q.at(kc('siege-trebuchet-demolished'), 41.5, 40, { scale: 1 });
    q.at(dg('rubble_large'), 37.5, 41, {});
    q.at(dg('rubble_large'), 45, 37.5, {});
    q.list.push(...banner(rect(36, 36, 10, 6), 'e', [38, 40], { model: M_BANNER_GOLD, y: 5 }));
    q.torches(rect(36, 36, 10, 6), 'n', [38, 44], GOLD);
  });

  p('son_can', (q) => {
    // Son Çan: the bell on the collapsing frame, collapsed rubble, siege wrecks and the bronze braziers
    const bell = FB.son_can;
    q.at(bell.model, 41, 29.5, { scale: bell.scale, tint: bell.tint, collide: true, id: 'les_son_can' });
    q.at(dg('pillar'), 37, 25.5, { scale: 1.2, collide: true });
    q.at(dg('pillar'), 45, 25.5, { scale: 1.2, collide: true });
    q.at(dg('pillar'), 37, 33.5, { scale: 1.2, collide: true });
    q.at(dg('pillar'), 45, 33.5, { scale: 1.2, collide: true });
    q.at(M_CHAINS, 41, 25.5, { y: 0 });
    q.at(kc('siege-ballista-demolished'), 33, 26, { scale: 1 });
    q.at(kc('siege-catapult-demolished'), 49.5, 33, { scale: 1 });
    q.at(dg('rubble_large'), 35, 31, {});
    q.at(dg('rubble_large'), 47, 26, {});
    q.at(M_BRAZIER, 33.5, 30.5, { scale: 1.2, collide: true, light: lt(0xffb060, 1.4, 8, true) });
    q.at(M_BRAZIER, 47.5, 30.5, { scale: 1.2, collide: true, light: lt(0xffb060, 1.4, 8, true) });
    q.list.push(...banner(rect(30, 24, 22, 12), 'n', [34, 40, 46], { model: M_BANNER_GOLD, y: 8, scale: 1.4 }));
    q.torches(rect(30, 24, 22, 12), 'w', [26, 30], GOLD);
  });

  p('can_kulesi', (q) => {
    q.at(kc('tower-square-base'), 56, 33, { scale: 1, collide: false });
    q.at(kc('tower-square-roof'), 53.5, 30.5, { scale: 1, rot: 35 });
    q.at(M_ALTAR, 59, 29.5, { scale: 0.8, tint: 0x8a7a68 });
    q.at(dg('chest'), 56.5, 36.4, { id: 'chest_kule', light: lt(GOLD, 0.8, 5, true) });
    q.at(M_BRAZIER, 53.5, 36.5, { scale: 1, collide: true, light: lt(0xffb060, 1.4, 8, true) });
    q.at(M_BRAZIER, 59.5, 36.5, { scale: 1, collide: true, light: lt(0xffb060, 1.4, 8, true) });
    q.list.push(...banner(rect(52, 29, 8, 8), 'w', [31, 35], { model: M_BANNER_GOLD, y: 10 }));
  });

  p('k_toll_b', (q) => {
    q.at(M_BONE_PILE, 28, 30, { scale: 1.2, tint: 0xd8d0b8 });
  });

  p('dus_meydan', (q) => {
    // Cesaret'in Eli on the gold dais (collide), the broken precinct wall, Gökbekçi Devi #3 (device dev_gd3)
    const eli = FB.cesaret_eli;
    q.at(eli.model, 15.5, 29.5, { scale: eli.scale, tint: eli.tint, collide: true, id: 'les_cesaret_eli' });
    q.at(kg('column-large'), 13, 26, { scale: 1.2, tint: 0xf0e4c8, collide: true, rot: 60 });
    q.at(kg('column-large'), 18, 33, { scale: 1.2, tint: 0xf0e4c8, collide: true, rot: -40 });
    const dev = DEV_GD[2];
    q.at(FB.gokbekci.model, dev[0], dev[1], { scale: FB.gokbekci.scale, tint: FB.gokbekci.tint, collide: true, id: 'dev_gd3', tag: 'device', device: 'dev_gd3' });
    q.at(kc('stairs-stone'), 24, 29.5, { scale: 1.2, rot: 90 });
    q.at(kc('wall-corner-slant'), 25, 22.5, { scale: 1 });
    q.at(kc('tower-square-top'), 23, 36, { scale: 1, rot: 70 });
    q.at(kf('wall-broken'), 6.5, 36.5, { scale: 1.2, rot: 90 });
    q.at(kf('wall-broken'), 6.5, 28, { scale: 1.2, rot: 90 });
    q.at(M_BRAZIER, 8, 24, { scale: 1.2, collide: true, light: lt(GOLD, 1.4, 8, true) });
    q.at(M_BRAZIER, 23, 24, { scale: 1.2, collide: true, light: lt(GOLD, 1.4, 8, true) });
    q.at(M_BRAZIER, 8, 36, { scale: 1.2, collide: true, light: lt(GOLD, 1.4, 8, true) });
    q.at(M_BRAZIER, 23, 36, { scale: 1.2, collide: true, light: lt(GOLD, 1.4, 8, true) });
    q.list.push(...banner(rect(6, 22, 20, 16), 'w', [25, 30], { model: M_BANNER_GOLD, y: 7, scale: 1.4 }));
    q.torches(rect(6, 22, 20, 16), 'e', [25, 30], GOLD);
  });

  p('k_kopru', (q) => {
    // Rib bridge rails, lanterns and the cloud sea (zones)
    q.at(FB.kemik_kopru.model, 14.5, 19, { scale: 1, tint: FB.kemik_kopru.tint, y: 0 });
    q.at(hw('lantern_standing'), 13.8, 20, { scale: 1, tint: 0x80ff60, light: lt(0x80ff60, 1.0, 6, true) });
    q.at(hw('lantern_standing'), 16.3, 21, { scale: 1, tint: 0x80ff60, light: lt(0x80ff60, 1.0, 6, true) });
  });

  p('dikis_kapi', (q) => {
    // Lobby: shrine Kudret (power), chains, operating tables, vats, the wake vats of p24 are in vana_odasi
    q.at(gp('pillar_broken'), 18, 16, { scale: 1, collide: true });
    q.at(M_CHAINS, 12, 11, { y: 0 });
    q.at(M_CHAINS, 20, 11, { y: 0 });
    q.at(FB.ameliyat_masasi.model, 13, 16, { scale: 1, tint: FB.ameliyat_masasi.tint, collide: true });
    q.at(M_CAGE, 22.5, 11, { scale: 1 });
    q.at(M_CAULDRON, 10, 12, { scale: 1, tint: GREEN, light: lt(GREEN, 1.2, 6, true) });
    q.at(M_CAULDRON, 18.5, 12.5, { scale: 1, tint: GREEN, light: lt(GREEN, 1.2, 6, true) });
    q.at(ip('psx-dungeon', 'chandelier'), 16, 14, { y: 7, scale: 1, tint: 0xd8ff80, light: lt(0xd8ff80, 1.0, 9, true) });
    q.list.push(...chandelier(12, 13, 7, { light: true, color: 0xd8ff80 }));
    q.torches(rect(8, 10, 16, 8), 'n', [10, 16, 22], GREEN);
  });

  p('vana_odasi', (q) => {
    // Dormant vats of p24: broken shells wake on approach (tag 'wake')
    for (const [x, z] of [[1.5, 12], [4, 9.5], [5.5, 13], [2.5, 14.5], [6, 11]] as [number, number][]) {
      q.at(FB.vana.model, x, z, { scale: FB.vana.scale, tint: FB.vana.tint, emissive: GREEN, emissiveIntensity: 0.8, tag: 'wake', collide: true });
    }
  });

  p('kan_havuzu', (q) => {
    q.at(hw('floor_dirt_grave'), 14, 5, { scale: 2, tint: 0x6a1a1a });
    q.at(M_CAULDRON, 9, 4, { scale: 1, tint: 0x6a1a1a });
    q.at(M_CHAINS, 18, 9, { y: 0 });
  });

  p('k_atolye', (q) => {
    q.at(M_CAGE, 26.5, 13.5, { scale: 1 });
  });

  p('dikis_atolye', (q) => {
    // Table island: the operating table on the 8 m platform (the boss sits next to it), slabs and the cages
    q.at(FB.ameliyat_masasi.model, 36.5, 5.5, { scale: 2, tint: FB.ameliyat_masasi.tint, collide: false, y: 0, id: 'dikiset_masasi' });
    q.at(M_CAULDRON, 35, 4.5, { scale: 1.2, tint: GREEN, y: 0, light: lt(GREEN, 1.8, 9, true) });
    q.at(ip('psx-dungeon', 'chandelier'), 36.5, 5.5, { y: 9, scale: 1, tint: 0xd8ff80, light: lt(0xd8ff80, 2.2, 12, false) });
    for (const [x, z] of [[31, 13], [42, 13], [45, 6], [28.5, 8]] as [number, number][]) {
      q.at(M_CAGE, x, z, { scale: 1, collide: true });
    }
    q.at(FB.vana.model, 31, 10, { scale: 1, tint: GREEN, emissive: GREEN, emissiveIntensity: 0.8, collide: true });
    q.at(FB.vana.model, 42, 10, { scale: 1, tint: GREEN, emissive: GREEN, emissiveIntensity: 0.8, collide: true });
    q.torches(rect(28, 2, 18, 14), 'e', [5, 9], GREEN);
  });

  p('k_yukari', (q) => {
    q.at(M_STATUE, 48, 9, { scale: 1.4, tint: 0x4a3a68, collide: true });
  });

  p('zolramus_kapi', (q) => {
    // Gate hall: the pillars of ribs and violet braziers, the skull swarm room (p36)
    for (const [x, z] of [[51.5, 4], [51.5, 14], [62, 4], [62, 14]] as [number, number][]) {
      q.at(FB.zol_sutun.model, x, z, { scale: FB.zol_sutun.scale, tint: FB.zol_sutun.tint, collide: true });
    }
    q.at(hw('post_skull'), 58.5, 4.5, { scale: 1.2 });
    q.at(hw('post_skull'), 58.5, 13.5, { scale: 1.2 });
    q.at(M_BRAZIER, 54, 8, { scale: 1, collide: true, light: lt(VIOLET, 2.0, 11, true) });
    q.at(M_BRAZIER, 61, 8, { scale: 1, collide: true, light: lt(VIOLET, 2.0, 11, true) });
    q.at(M_CRYSTAL_P, 57, 9, { scale: 1, emissive: VIOLET, emissiveIntensity: 0.6 });
    q.at(M_TABLE, 52, 12, { scale: 1, tint: 0xd8d0b8, collide: true });
    q.list.push(...banner(rect(50, 2, 14, 14), 'n', [53, 59], { model: M_BANNER, y: 12, tint: 0x4a2870, scale: 1.4 }));
  });

  p('k_nef_a', (q) => {
    q.at(hw('skull_candle'), 57, 17, { scale: 1, light: lt(VIOLET, 0.8, 5, true) });
  });

  p('kemik_nef', (q) => {
    // Nave: rib pillars, the cathedral chandelier, the skeleton statues on the cornice (y 9)
    q.at(FB.kemik_avize.model, 60, 24, { y: 18, scale: 2.4, tint: VIOLET, light: lt(VIOLET, 1.6, 12, true) });
    q.at(FB.kemik_avize.model, 60, 27, { y: 18, scale: 2.4, tint: VIOLET, light: lt(VIOLET, 1.6, 12, true) });
    for (const x of [55, 65]) {
      q.at(FB.zol_sutun.model, x, 26.5, { scale: 2.4, tint: FB.zol_sutun.tint, collide: true, y: 0 });
    }
    q.at(M_STATUE, 56, 20.5, { scale: 2.2, tint: 0x6a5a98, y: 9 });
    q.at(M_STATUE, 64, 20.5, { scale: 2.2, tint: 0x6a5a98, y: 9 });
    q.list.push(...banner(rect(52, 20, 16, 8), 'n', [56, 60, 64], { model: M_BANNER, y: 14, tint: 0x4a2870, scale: 1.6 }));
  });

  p('heykel_galerisi', (q) => {
    // Sculptors' gallery: finished and half-carved statues, workbenches, the shrine Koruma at (74, 22)
    q.at(FB.heykel_yarim.model, 70, 19, { scale: 1, tint: FB.heykel_yarim.tint, collide: true });
    q.at(FB.heykel_yarim.model, 74, 27, { scale: 1, tint: FB.heykel_yarim.tint, collide: true, y: 0 });
    q.at(M_STATUE, 78, 19, { scale: 1.6, tint: 0x4a3a68, collide: true });
    q.at(ks('workbench'), 71, 24, { scale: 1, rot: 90 });
    q.at(ks('workbench-anvil'), 76, 22, { scale: 1 });
    q.at(hw('bone_A'), 70.5, 22.5, { scale: 1 });
    q.at(M_ALTAR, 74, 22, { scale: 1, tint: 0x8a7a68, collide: true });
    q.at(M_CRYSTAL_P, 74, 22, { y: 1.2, scale: 0.9, emissive: VIOLET, emissiveIntensity: 0.6 });
    q.at(kg('crypt-large'), 74, 30.5, { scale: 2, tint: 0x8a8a98, rot: 0 });
    q.torches(rect(68, 16, 12, 16), 'e', [18, 26], VIOLET);
  });

  p('k_cikis', (q) => {
    q.at(M_CRYSTAL, 73.5, 34, { scale: 1, tint: FROST, collide: false });
  });

  p('buz_tepe', (q) => {
    // Summit: the throne (les_buz_taht), crystal spires on the rim, frozen wardens kneeling in a ring, snow
    q.at(FB.buz_taht.model, 70.5, 51.5, { scale: 1.5, tint: FB.buz_taht.tint, collide: false });
    q.ring(FB.buz_kristal.model, 70.5, 44.5, 9, 8, { scale: FB.buz_kristal.scale, tint: FB.buz_kristal.tint, collide: false, y: 0 });
    q.ring(M_STATUE, 70.5, 44.5, 6, 6, { scale: 1.6, tint: FROST, opacity: 0.9, collide: false, y: 0.4 });
    q.at(M_CRYSTAL, 73.5, 49, { scale: 1.4, tint: FROST, light: lt(0x80d0ff, 2.0, 12, true) });
    q.at(M_CRYSTAL, 67, 40, { scale: 1.4, tint: FROST, light: lt(0x80d0ff, 2.0, 12, true) });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Assemble: room props from the decorator, then the dungeon definition.
// ---------------------------------------------------------------------------------------------------------------------
const ROOMS_BASE: RoomDef[] = ROOM_BASE.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] }));
const RECTS = rectsOf(ROOMS_BASE);
const CTX = makeCtx('les_uyanisi', DOORS, PACKS, [
  { x: START[0], z: START[1], r: 2.0 },
  { x: FONT[0], z: FONT[1], r: 1.6 },
  { x: EXIT[0], z: EXIT[1], r: 2.8 },
  ...BOSSES.map((b) => ({ x: b.pos[0], z: b.pos[1], r: 4.5 })),
  ...DEV_GD.map(([x, z]) => ({ x, z, r: 1.8 })),
  { x: 8.5, z: 16, r: 1.5 },
  { x: 74, z: 22, r: 1.5 },
]);
const DECOR = decorator(CTX, RECTS);
dressRooms((id, fn) => DECOR.room(id, fn));

export const LES_UYANISI_ROOMS: RoomDef[] = withProps(ROOMS_BASE, DECOR.out);

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(FONT[0], FONT[1]),
  shrines: [
    { type: 'shrine_power', pos: pt(8.5, 16) },   // Kudret
    { type: 'shrine_ward', pos: pt(74, 22) },     // Koruma
  ],
  riftSpots: [],
  chests: [{ pos: pt(26.4, 43.4), kind: 'chest_wood' }, { pos: pt(56.5, 36.4), kind: 'chest_gold' }],
};

export const LES_UYANISI: DungeonDef = {
  id: 'les_uyanisi',
  name: 'Leş Uyanışı',
  shortName: 'Leş Uyanışı',
  lore: "Kadim Diyar'ın üstündeki Cesaret Tapınağı yüzyıllardır Kadim Mühür'ü kapalı tutar. Leş Tarikatı, Azrakel'in son meclisi, tapınağın üzerine uçan bir kemik zigurat kaldırdı: Gökbekçilerin ruhları hasat ediliyor, ölüler dikişle birbirine bağlanıyor, Ayazbağlayan Nalthor mührü kıran buzu hazırlıyor.",
  levelRange: [50, 60],
  timerSec: 1800,
  forcesRequired: 430,
  theme: {
    fogColor: 0xd8e6f2, fogNear: 22, fogFar: 90,
    ambient: 0xfff4d8, ambientIntensity: 0.9,
    hemiSky: 0xcfe4ff, hemiGround: 0x9a8a68,
    torchColor: 0xffd070, bloomStrength: 0.35,
    music: 'dungeon_crypt',
    palette: [0xe8dcc0, 0xe0b048, 0xd8d0b8, 0x6a3a9a, 0x9aff50, 0x8a4a40, 0x9ad8ff],
    tint: 0xf0e8d8,
  },
  grid: { w: 80, h: 64 },
  rooms: LES_UYANISI_ROOMS,
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 90 },
  exit: { pos: shPt(EXIT[0], EXIT[1]) },
  extras: EXTRAS,
  atmospheres: ATMOSPHERES,
  season: 1,
  endgame: true,
  vertical: true,
};
