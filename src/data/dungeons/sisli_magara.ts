import type { DungeonDef, DungeonTheme, RoomDef } from '../../types/dungeons';
import { bossAt, door, pack, room } from './kit';

/**
 * SISLI MAGARA (fog cave) - the starter dungeon of the low-level set (levelling.ts). Band 1-10, ~10 min solo: 6 rooms in a line,
 * 29 mobs in small packs (2-3), a mid-boss (Morkan, caster, summons) and an easy final boss (Kaldur, telegraphed cleave).
 * Hand-authored short layout on the kit helpers; no decorator (rooms use the builder's auto decor only).
 * Layout is in tile coordinates (1 tile = 4 m). Doors sit on the room's `side` edge: 'e' = last column, 'n' = first row.
 */

const THEME: DungeonTheme = {
  fogColor: 0x1e2a2c, fogNear: 10, fogFar: 44, ambient: 0x4a5a58, ambientIntensity: 0.4, hemiSky: 0x7a8c96, hemiGround: 0x2a2418,
  torchColor: 0xffb070, bloomStrength: 0.25, music: 'dungeon_crypt', palette: [0x35403e, 0x6f7f78, 0xd6d8cc, 0x9fd8e8, 0xffb070], tint: 0xcfd8d4,
};

const ROOMS: RoomDef[] = [
  room('mag_giris', 'Mağara Ağzı', 2, 26, 8, 8, 'dirt', 'cave', 0.4),
  room('mag_gecit', 'Sis Geçidi', 10, 27, 6, 6, 'dirt', 'cave', 0.3),
  room('mag_salon', 'Sisli Salon', 16, 20, 10, 12, 'stone_dark', 'cave', 0.5),
  room('mag_orta', 'Orta Mezar', 14, 10, 14, 10, 'stone', 'cave', 0.4, { boss: 1 }),
  room('mag_son', 'Kadim Oda', 14, 2, 14, 8, 'tiles', 'stone', 0.3, { boss: 2 }),
];

const DOORS = [
  door('mag_giris', 'mag_gecit', 9, 28, 'e', 4, 'none'),
  door('mag_gecit', 'mag_salon', 15, 28, 'e', 4, 'none'),
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
  pack('m_p04', 'mag_salon', 18, 23, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.38, 0.35]]),
  pack('m_p05', 'mag_salon', 23, 23, undefined, [['crypt_ghoul', 0.3, 0], ['skel_minion', -0.38, 0.35]]),
  pack('m_p06', 'mag_salon', 18, 28, undefined, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
  pack('m_p07', 'mag_salon', 23, 28, undefined, [['skel_warrior', 0, 0], ['skel_mage', 1.0, -0.6]]),
  pack('m_p08', 'mag_salon', 20, 25, undefined, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35]]),
  pack('m_p13', 'mag_salon', 17.5, 21.5, undefined, [['skel_minion', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
  pack('m_p09', 'mag_orta', 24, 13, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.82, -1.04]]),
  pack('m_p14', 'mag_orta', 17, 16, undefined, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
  pack('m_p10', 'mag_son', 18, 5, undefined, [['skel_warrior', 0.3, 0], ['skel_minion', -0.38, 0.35]]),
  pack('m_p11', 'mag_son', 23, 4, undefined, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35]]),
  pack('m_p12', 'mag_son', 16, 4, undefined, [['crypt_ghoul', 0.3, 0], ['skel_rattler', -0.38, 0.35]]),
];

const START: [number, number] = [5, 30];
const FONT: [number, number] = [5, 33];
const EXIT: [number, number] = [21, 4];

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
  rooms: ROOMS,
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
  },
};
