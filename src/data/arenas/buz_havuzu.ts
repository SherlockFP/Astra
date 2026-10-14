/**
 * Buz Havuzu (GDD_PVP_FINDER §3.2.3): 2v2 and 3v3, 18 x 14 tiles. The frozen centre is a visual `ice` zone (never blocked); its
 * rect is the bounding square of the GDD circle (centre (9,7), radius 4).
 */
import type { ArenaMapData } from './index';

export const BUZ_HAVUZU: ArenaMapData = {
  id: 'buz_havuzu',
  name: 'Buz Havuzu',
  brackets: ['2v2', '3v3'],
  grid: { w: 18, h: 14 },
  floor: 'ice',
  wall: 'ice',
  theme: { fogColor: 0x1a2a36, fogNear: 10, fogFar: 44, ambient: 0x5a7a92, ambientIntensity: 0.45, hemiSky: 0xa8d0e8, hemiGround: 0x1a2430, torchColor: 0xbfe8ff, bloomStrength: 0.2, music: 'dungeon_frost', palette: [0x9ac0d8, 0xd8f0ff, 0x4a6a80, 0xbfe8ff], tint: 0xd8f0ff },
  lightColor: 0xbfe8ff,
  walls: [
    { x: 6, z: 5, w: 1, h: 1 },   // west cover
    { x: 11, z: 8, w: 1, h: 1 },  // east cover
  ],
  pillars: [
    { pos: [4, 3], r: 0.6 }, { pos: [14, 3], r: 0.6 }, { pos: [4, 11], r: 0.6 }, { pos: [14, 11], r: 0.6 },
    { pos: [9, 2], r: 0.6 }, { pos: [9, 12], r: 0.6 },
  ],
  spawns: {
    A: [[1.5, 6.5], [1.5, 7.5], [2.5, 5.5]],
    B: [[16.5, 6.5], [16.5, 7.5], [15.5, 8.5]],
  },
  gates: [
    { team: 'A', rect: { x: 0, z: 5, w: 1, h: 4 } },
    { team: 'B', rect: { x: 17, z: 5, w: 1, h: 4 } },
  ],
  zones: [{ kind: 'ice', rect: { x: 5, z: 3, w: 8, h: 8 } }],
};
