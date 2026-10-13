import type { DungeonDef } from '../types/dungeons';
import { door, lift, plateau, ramp, room, stairs, tall, pack, chandelier, rectZone } from '../data/dungeons/kit';

/**
 * dev_height: vertical-engine demo set (ENGINE_VERTICALITY §18). Loaded by dev/world.html?dungeon=dev_height&nav=1.
 * Grid 56 x 52 tiles, `vertical: true`. Floors are absolute metres; rects are tile-corner based (kit COORDINATES note).
 * Headless assertions live in tools/height-check.mjs; the validator rules in src/dev/contentCheck.ts (checkVerticalDungeon).
 * Theme copied from the dev test dungeon (src/dev/world.ts testDungeon).
 */

const H_ENTRY = tall(room('h_entry', 'Giriş', 2, 26, 8, 6, 'stone_dark', 'stone', 0.4, { floorY: 0 }), 6);
const H_STAIRS = tall(room('h_stairs', 'Merdiven Salonu', 10, 26, 14, 6, 'stone', 'stone', 0.4, {
  floorY: 0,
  heightAreas: [plateau({ x: 18, z: 26, w: 6, h: 6 }, 3.2, 'rail', 'h_plateau')],
  slopes: [stairs({ x: 16, z: 27, w: 2, h: 4 }, 'x', 0, 3.2, { id: 'h_stairs_1' })],
}), 8);
const H_BRIDGE = tall(room('h_bridge', 'Uçurum Köprüsü', 24, 24, 16, 10, 'stone', 'stone', 0.3, {
  floorY: 3.2,
  zones: [
    { kind: 'void', blocked: true, fall: 'open', depth: 9, rect: { x: 26, z: 25, w: 12, h: 8 } },
    { kind: 'bridge', rect: { x: 26, z: 29, w: 12, h: 1 }, y: 3.2 },
  ],
}), 14);
const H_HALL = tall(room('h_hall', 'Yüksek Salon', 40, 20, 14, 18, 'stone', 'stone', 0.5, {
  floorY: 3.2,
  heightAreas: [plateau({ x: 44, z: 26, w: 6, h: 6 }, 4.4, 'rail', 'h_dais')],
  slopes: [ramp({ x: 43, z: 27, w: 1, h: 4 }, 'x', 3.2, 4.4, { id: 'h_dais_ramp' })],
  zones: [{ kind: 'pit', blocked: true, fall: 'kill', depth: 9, rect: { x: 41, z: 35, w: 2, h: 2 } }],
  tiers: [
    { kind: 'ring', y: 12, rect: { x: 40, z: 20, w: 14, h: 18 }, depth: 3 },
    { kind: 'windows', y: 15, rect: { x: 40, z: 20, w: 14, h: 1 }, count: 5, spacing: 2.5 },
    { kind: 'colonnade', y: 12, rect: { x: 41, z: 21, w: 12, h: 16 }, count: 6 },
  ],
  props: [...chandelier(47, 23, 22), ...chandelier(47, 35, 22)],
}), 22);
const H_LIFT = tall(room('h_lift', 'Asansör Galerisi', 40, 8, 14, 12, 'stone', 'stone', 0.4, {
  floorY: 3.2,
  heightAreas: [plateau({ x: 40, z: 8, w: 14, h: 3 }, 9.2, 'ledge', 'h_balcony')],
}), 16);
const H_LOW = tall(room('h_low', 'Alçak Koridor', 46, 38, 2, 8, 'stone_dark', 'stone', 0.3, {
  floorY: 3.2,
  slopes: [ramp({ x: 46, z: 44, w: 2, h: 2 }, 'z', 3.2, -2.4, { id: 'h_low_ramp' })],
}), 3);
const H_SUNKEN = tall(room('h_sunken', 'Çöken Oda', 42, 46, 14, 6, 'stone_dark', 'stone', 0.3, {
  floorY: -2.4,
  zones: [rectZone('pool', 45, 48, 6, 3, { color: 0x1a3a4a, glow: 0x3a8aaa, glowIntensity: 0.8 })],
}), 8);

export const DEV_HEIGHT: DungeonDef = {
  id: 'dev_height',
  name: 'Yükseklik Testi',
  shortName: 'Yükseklik',
  lore: 'dev',
  levelRange: [1, 10],
  timerSec: 0,
  forcesRequired: 0,
  theme: { fogColor: 0x141a18, fogNear: 8, fogFar: 40, ambient: 0x3c4a48, ambientIntensity: 0.35, hemiSky: 0x6a7a90, hemiGround: 0x201810, torchColor: 0xffa050, music: 'dungeon_crypt', tint: 0xc8d0c8 },
  grid: { w: 56, h: 52 },
  vertical: true,
  rooms: [H_ENTRY, H_STAIRS, H_BRIDGE, H_HALL, H_LIFT, H_LOW, H_SUNKEN],
  doors: [
    door('h_entry', 'h_stairs', 9, 29, 'e', 2, 'open'),
    door('h_stairs', 'h_bridge', 23, 29, 'e', 1, 'open'),
    door('h_bridge', 'h_hall', 39, 29, 'e', 1, 'open'),
    door('h_hall', 'h_lift', 46, 20, 'n', 2, 'open'),
    door('h_hall', 'h_low', 46, 37, 's', 2, 'open'),
    door('h_low', 'h_sunken', 46, 45, 's', 2, 'open'),
  ],
  lifts: [lift('h_lift_1', 'h_lift', { x: 46, z: 11, w: 1, h: 1 }, [3.2, 9.2], { mode: 'call' })],
  packs: [
    // melee on the plateau: they must walk the stairs down to a player on the lower floor
    pack('p_stairs', 'h_stairs', 21, 29, undefined, [['skel_minion', -1, 0], ['skel_minion', 1, 0], ['skel_minion', 0, 1]]),
    // melee under the balcony: cannot reach an archer on the balcony
    pack('p_under', 'h_lift', 47, 15, undefined, [['skel_minion', -1, 0], ['skel_minion', 1, 0], ['skel_minion', 0, 1]]),
    // ranged on the balcony (6 m up)
    pack('p_archers', 'h_lift', 44, 9.5, undefined, [['skel_archer', -0.5, 0], ['skel_archer', 0.5, 0]]),
    // melee on the bridge bank, next to the void (knockback = fall)
    pack('p_edge', 'h_bridge', 31, 33.5, undefined, [['skel_minion', -0.5, 0], ['skel_minion', 0.5, 0]]),
    // ranged on the dais (1.2 m up from the hall floor)
    pack('p_dais', 'h_hall', 47, 29, undefined, [['skel_archer', -0.5, 0], ['skel_archer', 0.5, 0]]),
  ],
  bosses: [],
  start: { pos: [5.5, 29], facing: 90 },
  exit: { pos: [48, 49] },
  extras: {
    fontOfPower: [4, 27],
    shrines: [],
    riftSpots: [],
    chests: [{ pos: [50, 9.5], kind: 'chest_gold' }],
  },
};
