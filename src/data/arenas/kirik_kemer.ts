/** Kırık Kemer (GDD_PVP_FINDER §3.2.3): 1v1 and 2v2, 12 x 12 tiles. Layout tuned in playtest. */
import type { ArenaMapData } from './index';

export const KIRIK_KEMER: ArenaMapData = {
  id: 'kirik_kemer',
  name: 'Kırık Kemer',
  brackets: ['1v1', '2v2'],
  grid: { w: 12, h: 12 },
  floor: 'stone_dark',
  wall: 'stone',
  theme: { fogColor: 0x1c2024, fogNear: 10, fogFar: 40, ambient: 0x4a4e58, ambientIntensity: 0.4, hemiSky: 0x7a8498, hemiGround: 0x201c18, torchColor: 0xffb070, bloomStrength: 0.25, music: 'dungeon_crypt', palette: [0x2b2c30, 0x5d5f66, 0xd8d0b8, 0xffb070] },
  lightColor: 0xffc890,
  walls: [
    { x: 5, z: 1, w: 2, h: 1 },   // north cover
    { x: 5, z: 10, w: 2, h: 1 },  // south cover
  ],
  pillars: [
    { pos: [3, 3], r: 0.6 }, { pos: [9, 3], r: 0.6 }, { pos: [3, 9], r: 0.6 }, { pos: [9, 9], r: 0.6 },
    { pos: [6, 6], r: 1.0 },      // centre pillar
  ],
  spawns: {
    A: [[1.5, 5.5], [1.5, 6.5], [1.5, 4.5]],
    B: [[10.5, 5.5], [10.5, 6.5], [10.5, 7.5]],
  },
  gates: [
    { team: 'A', rect: { x: 0, z: 5, w: 1, h: 2 } },
    { team: 'B', rect: { x: 11, z: 5, w: 1, h: 2 } },
  ],
};
