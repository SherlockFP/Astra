/** Kızıl Halka (GDD_PVP_FINDER §3.2.3): 2v2 and 3v3, 16 x 16 tiles. The third B spawn is the 3v3 extra. */
import type { ArenaMapData } from './index';

export const KIZIL_HALKA: ArenaMapData = {
  id: 'kizil_halka',
  name: 'Kızıl Halka',
  brackets: ['2v2', '3v3'],
  grid: { w: 16, h: 16 },
  floor: 'temple',
  wall: 'temple',
  theme: { fogColor: 0x241410, fogNear: 12, fogFar: 46, ambient: 0x5a3a30, ambientIntensity: 0.4, hemiSky: 0x9a6a58, hemiGround: 0x2a1410, torchColor: 0xff7040, bloomStrength: 0.3, music: 'dungeon_fire', palette: [0x3a2420, 0x7a4030, 0xe0c0a0, 0xff7040] },
  lightColor: 0xff9060,
  walls: [
    { x: 7, z: 2, w: 2, h: 1 },   // north cover
    { x: 7, z: 13, w: 2, h: 1 },  // south cover
  ],
  pillars: [
    { pos: [6, 6], r: 0.8 }, { pos: [10, 6], r: 0.8 }, { pos: [6, 10], r: 0.8 }, { pos: [10, 10], r: 0.8 },   // ring
    { pos: [2, 2], r: 0.5 }, { pos: [14, 2], r: 0.5 }, { pos: [2, 14], r: 0.5 }, { pos: [14, 14], r: 0.5 },   // corners
  ],
  spawns: {
    A: [[1.5, 7.5], [1.5, 8.5], [2.5, 6.5]],
    B: [[14.5, 7.5], [14.5, 8.5], [13.5, 6.5]],
  },
  gates: [
    { team: 'A', rect: { x: 0, z: 6, w: 1, h: 4 } },
    { team: 'B', rect: { x: 15, z: 6, w: 1, h: 4 } },
  ],
};
