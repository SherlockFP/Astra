import type { DungeonDef, DungeonTheme, RoomDef } from '../../types/dungeons';
import { bossAt, door, pack, room } from './kit';

/**
 * SISLI MAGARA (fog cave) - the starter dungeon of the low-level set (levelling.ts). Band 1-10, ~10 min solo: 6 rooms in a line,
 * 29 mobs in small packs (2-3), a mid-boss (Morkan, caster, summons) and an easy final boss (Kaldur, telegraphed cleave).
 * Hand-authored short layout on the kit helpers; no decorator (rooms use the builder's auto decor only).
 * Layout is in tile coordinates (1 tile = 4 m). Doors sit on the room's `side` edge: 'e' = last column, 'n' = first row.
 */

const THEME: DungeonTheme = {
  fogColor: 0x0d1a1c, fogNear: 9, fogFar: 46, ambient: 0x23434a, ambientIntensity: 0.4, hemiSky: 0x4c7480, hemiGround: 0x161a18,
  torchColor: 0xffa858, bloomStrength: 0.25, music: 'dungeon_crypt', palette: [0x35403e, 0x6f7f78, 0xd6d8cc, 0x9fd8e8, 0xffb070], tint: 0xcfd8d4,
  moon: { color: 0x9ee6f0, intensity: 0.45 }, rim: { color: 0x6fd8e8, intensity: 0.45 },
};

const ROOMS: RoomDef[] = [
  room('mag_giris', 'Mağara Ağzı', 2, 26, 8, 8, 'dirt', 'cave', 0.4, { ceiling: 10 }),
  room('mag_gecit', 'Sis Geçidi', 10, 25, 6, 8, 'dirt', 'cave', 0.3, { ceiling: 10 }),
  room('mag_salon', 'Sisli Salon', 16, 20, 10, 12, 'stone_dark', 'cave', 0.5, { ceiling: 12 }),
  room('mag_orta', 'Orta Mezar', 14, 10, 14, 10, 'stone', 'cave', 0.4, { boss: 1, ceiling: 12 }),
  room('mag_son', 'Kadim Oda', 14, 2, 14, 8, 'tiles', 'stone', 0.3, { boss: 2, ceiling: 10 }),
];

const DOORS = [
  door('mag_giris', 'mag_gecit', 9, 27, 'e', 6, 'none'),
  door('mag_gecit', 'mag_salon', 15, 25, 'e', 6, 'none'),
  door('mag_salon', 'mag_orta', 20, 20, 'n', 4, 'none'),
  door('mag_orta', 'mag_son', 20, 10, 'n', 4, 'boss_lock'),
];

/**
 * 28 mobs in 14 packs (the mandatory route; no optional packs): packs of 2 everywhere. The starter must not
 * kill a solo player (owner: "start too hard"), so the pulls are small and the trash hits softer (trashDmgMult below).
 */
const PACKS = [
  pack('m_p01', 'mag_giris', 6, 29, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.38, 0.35]]),
  pack('m_p02', 'mag_giris', 4, 32, undefined, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.4, 0.3]]),
  pack('m_p03', 'mag_gecit', 12.5, 29.5, undefined, [['crypt_rat', 0.3, 0], ['crypt_rat', -0.38, 0.35]]),
  // patrols (walk a short leg, pause, turn): two of the 14 route packs, each back and forth inside its own room
  pack('m_p04', 'mag_salon', 18, 23, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.38, 0.35]], { patrol: [[18, 23], [18, 27]] }),
  pack('m_p05', 'mag_salon', 23, 23, undefined, [['crypt_ghoul', 0.3, 0], ['skel_minion', -0.38, 0.35]]),
  pack('m_p06', 'mag_salon', 18, 28, undefined, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
  pack('m_p07', 'mag_salon', 23, 28, undefined, [['skel_warrior', 0, 0], ['skel_mage', 1.0, -0.6]]),
  pack('m_p08', 'mag_salon', 20, 25, undefined, [['skel_minion', 0.3, 0], ['skel_mage', -0.38, 0.35]]),
  pack('m_p13', 'mag_salon', 17.5, 21.5, undefined, [['skel_minion', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
  pack('m_p09', 'mag_orta', 24, 13, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.82, -1.04]]),
  pack('m_p14', 'mag_orta', 17, 16, undefined, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
  pack('m_p10', 'mag_son', 18, 5, undefined, [['skel_warrior', 0.3, 0], ['skel_minion', -0.38, 0.35]]),
  pack('m_p11', 'mag_son', 23, 4, undefined, [['skel_minion', 0.3, 0], ['skel_mage', -0.38, 0.35]]),
  pack('m_p12', 'mag_son', 16, 4, undefined, [['crypt_ghoul', 0.3, 0], ['skel_rattler', -0.38, 0.35]], { patrol: [[16, 4], [16, 7]] }),
];

const START: [number, number] = [5, 30];
const FONT: [number, number] = [5, 33];
const EXIT: [number, number] = [21, 4];

/** Raised boss dais in Orta Mezar: a 2 m platform (6 x 6 tiles) with a stone ramp on its south edge (vertical dungeon). */
const HEIGHT_AREAS = [{ id: 'orta_dais', rect: { x: 17, z: 11, w: 6, h: 6 }, y: 2, rim: 'rail' as const, floor: 'stone' as const }];
const SLOPES = [{ id: 'orta_ramp', kind: 'ramp' as const, rect: { x: 17, z: 17, w: 6, h: 2 }, axis: 'z' as const, yFrom: 2, yTo: 0, style: 'stone' as const }];

export const SISLI_MAGARA: DungeonDef = {
  id: 'sisli_magara',
  name: 'Sisli Mağara',
  shortName: 'Mağara',
  lore: 'Sisli Vadi\'nin kuzeyinde sis hiç dağılmayan bir mağara var. İçeride kadim bir oda ve ona bağlı ruhlar geçen yolcuları bekliyor. Orta Mezar\'da Sisli Çağırıcı ruhları sisin içinden çağırır; Kadim Oda\'nın son bekçisi ise hâlâ kapıyı tutuyor.',
  levelRange: [1, 10],
  timerSec: 600,
  forcesRequired: 52,
  trashDmgMult: 0.45,
  theme: THEME,
  grid: { w: 30, h: 36 },
  vertical: true,
  rooms: ROOMS.map((r) => (r.id === 'mag_orta' ? { ...r, heightAreas: HEIGHT_AREAS, slopes: SLOPES } : r)),
  doors: DOORS,
  packs: PACKS,
  bosses: [
    bossAt('boss_mag_morkan', 'mag_orta', 20, 15, 0, 1),
    bossAt('boss_mag_bekci', 'mag_son', 20, 5, 180, 2),
  ],
  start: { pos: START, facing: 0 },
  exit: { pos: EXIT },
  extras: {
    fontOfPower: FONT,
    shrines: [{ type: 'shrine_power', pos: [22, 31] }, { type: 'shrine_ward', pos: [18, 14] }],
    riftSpots: [],
    /** Optional treasure in the side corners of the gecit and the entry hall (no pack on the route). */
    chests: [{ pos: [10.5, 25.5], kind: 'chest_wood' }, { pos: [2.5, 26.5], kind: 'chest_iron' }],
  },
};
