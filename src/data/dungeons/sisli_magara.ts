import type { DungeonDef, DungeonTheme, PackDef, RoomDef } from '../../types/dungeons';
import { Props, bossAt, circleZone, decorator, door, dg, gp, hw, lt, makeCtx, pack, rectsOf, room, withProps } from './kit';

/**
 * SISLI MAGARA (fog cave) - the starter dungeon of the low-level set (levelling.ts). Band 1-10, ~10 min solo.
 * Restructure (blueprint 7.1, starter form): 9 rooms, 9 doors, 12 packs (11 on the mandatory route + 1 optional), 2 bosses.
 *   mag_giris (entry cave) -> mag_tunel (2 wide connector, a patrol pack) -> mag_catal (fork hub)
 *   -> two parallel side caves mag_kuzey / mag_guney (1 pack each) that rejoin in mag_salon (3 packs, one lieutenant)
 *   -> mag_orta boss 1 arena (Morkan on a short dais, 3 adds in the corner) -> mag_son boss 2 arena (Bekci, the final room).
 * Optional: mag_kuytu, a dead-end grave west of the tunnel with one pack, a chest and the ward shrine.
 * Shortcuts: none (a starter has one route on purpose). Pulls stay at 2 members (see PACKS); one dormant bone pack.
 * forcesRequired = floor(0.8 x total pack forces). Tile coordinates (1 tile = 4 m). Doors sit on the room's `side` edge.
 */

const THEME: DungeonTheme = {
  fogColor: 0x0d1a1c, fogNear: 9, fogFar: 46, ambient: 0x23434a, ambientIntensity: 0.4, hemiSky: 0x4c7480, hemiGround: 0x161a18,
  torchColor: 0xffa858, bloomStrength: 0.25, music: 'dungeon_crypt', palette: [0x35403e, 0x6f7f78, 0xd6d8cc, 0x9fd8e8, 0xffb070], tint: 0xcfd8d4,
  moon: { color: 0x9ee6f0, intensity: 0.45 }, rim: { color: 0x6fd8e8, intensity: 0.45 },
};

const CAVE_TORCH = 0xffa858;
const SHRINE_BLUE = 0x9fd8e8;

/** Floor sigils: the font rune in the entry cave and a dim rune circle under the Kadim Bekci's arena. */
const RUNE_FONT = circleZone('rune', 5, 33, 1.2, { color: 0x0d1a1c, glow: SHRINE_BLUE, glowIntensity: 0.4 });
const RUNE_BOSS = circleZone('rune', 20.5, 36, 3.5, { color: 0x101a16, glow: SHRINE_BLUE, glowIntensity: 0.4 });

const ROOMS: RoomDef[] = [
  room('mag_giris', 'Mağara Ağzı', 2, 26, 8, 8, 'dirt', 'cave', 0.4, { ceiling: 10, zones: [RUNE_FONT] }),
  room('mag_tunel', 'Sis Tüneli', 4, 17, 2, 9, 'dirt', 'cave', 0.4, { ceiling: 8 }),
  room('mag_catal', 'Sis Çatalı', 2, 8, 10, 9, 'dirt', 'cave', 0.4, { ceiling: 10 }),
  room('mag_kuzey', 'Kuzey Oyuğu', 12, 8, 6, 4, 'stone_dark', 'cave', 0.4, { ceiling: 8 }),
  room('mag_guney', 'Güney Oyuğu', 12, 13, 6, 4, 'stone_dark', 'cave', 0.4, { ceiling: 8 }),
  room('mag_salon', 'Sisli Salon', 18, 8, 10, 10, 'stone_dark', 'cave', 0.5, { ceiling: 12 }),
  room('mag_orta', 'Orta Mezar', 16, 18, 12, 12, 'stone', 'cave', 0.4, { boss: 1, ceiling: 12, ambientVfx: 'ambient_dust' }),
  room('mag_son', 'Kadim Oda', 14, 30, 14, 12, 'tiles', 'stone', 0.3, { boss: 2, ceiling: 10, zones: [RUNE_BOSS] }),
  room('mag_kuytu', 'Gizli Mezar', 0, 18, 4, 6, 'dirt', 'cave', 0.5, { optional: true, ceiling: 8 }),
];

const DOORS = [
  door('mag_giris', 'mag_tunel', 4, 26, 'n', 2, 'none'),
  door('mag_tunel', 'mag_catal', 4, 17, 'n', 2, 'none'),
  door('mag_tunel', 'mag_kuytu', 4, 19, 'w', 2, 'none'),
  // the fork: two parallel side caves that both reach the merge hall
  door('mag_catal', 'mag_kuzey', 11, 9, 'e', 2, 'none'),
  door('mag_catal', 'mag_guney', 11, 14, 'e', 2, 'none'),
  door('mag_kuzey', 'mag_salon', 17, 9, 'e', 2, 'none'),
  door('mag_guney', 'mag_salon', 17, 14, 'e', 2, 'none'),
  // boss 1 arena (south of the hall), boss 2 arena (south of boss 1)
  door('mag_salon', 'mag_orta', 21, 17, 's', 4, 'boss_lock'),
  door('mag_orta', 'mag_son', 21, 29, 's', 4, 'boss_lock'),
];

/**
 * Packs: 2 members each (the owner rule for the starter: "start too hard", so the pulls stay small), one lieutenant pull of 3, and
 * the Morkan arena adds (2). A 3-member route put the solo L10 knight at 164 / 693 HP entering boss 1 in the dungeon_run sim, the
 * 2-member route at about 400, so the blueprint pack size of 3 is deliberately not used here. Forces are the members' sum (pack()).
 */
const PACKS: PackDef[] = [
  pack('mag_p01', 'mag_giris', 6, 28, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.38, 0.35]]),
  pack('mag_p02', 'mag_giris', 7, 31, undefined, [['crypt_rat', 0.3, 0], ['crypt_rat', -0.38, 0.35]], { dormant: { kind: 'bones', wakeRadius: 5 } }),
  pack('mag_p03', 'mag_tunel', 4.5, 21, undefined, [['skel_minion', 0.3, 0.2], ['crypt_rat', -0.3, -0.9]], { patrol: [[4.5, 19.5], [4.5, 23.5]] }),
  pack('mag_p04', 'mag_catal', 5, 12, undefined, [['crypt_ghoul', 0.3, 0], ['skel_archer', -0.6, -1.2]]),
  pack('mag_p05', 'mag_catal', 9, 15, undefined, [['skel_rattler', 0.3, 0], ['skel_mage', -0.5, -1.1]]),
  pack('mag_p06', 'mag_kuzey', 14.5, 9.5, undefined, [['skel_warrior', 0.3, 0], ['skel_minion', -0.4, -0.8]]),
  pack('mag_p07', 'mag_guney', 14.5, 14.5, undefined, [['crypt_ghoul', 0.3, 0], ['skel_archer', -0.4, 0.6]]),
  pack('mag_p08', 'mag_salon', 20, 10.5, undefined, [['skel_minion', 0.3, 0], ['skel_rattler', -0.4, 0.9]], { patrol: [[20, 10.5], [24, 10.5]] }),
  pack('mag_p09', 'mag_salon', 25, 14, undefined, [['crypt_ghoul', 0.3, 0], ['skel_mage', -0.4, -0.9]]),
  // the lieutenant of the hall: the one big pull before the Morkan door (3 members)
  pack('mag_p10', 'mag_salon', 21.5, 14.5, undefined, [['skel_warrior', 0, 0], ['skel_mage', -0.9, -0.6], ['skel_archer', 0.9, 0.6]], { big: true, note: 'Salon lieutenant: the big pull before the Morkan door.' }),
  pack('mag_p11', 'mag_kuytu', 1.5, 20.5, undefined, [['crypt_rat', 0, 0], ['skel_rattler', 0.5, 0.6]], { optional: true }),
  // the Morkan arena adds (2), in the north-west corner clear of the dais. Last mandatory pack of the arena room: the run order puts boss 1 after it.
  pack('mag_p12', 'mag_orta', 18.5, 21.5, undefined, [['skel_minion', 0.3, 0], ['skel_archer', -0.4, -0.9]]),
];

const START: [number, number] = [5, 30];
const FONT: [number, number] = [5, 33];
const EXIT: [number, number] = [24, 40];
const BOSS_1: [number, number] = [21.5, 26.5];
const BOSS_2: [number, number] = [20.5, 36];

/** Morkan's dais (2 m, north half of the arena) with a stone ramp on its south edge. Boss 1 stands on the floor below it. */
const HEIGHT_AREAS = [{ id: 'orta_dais', rect: { x: 22, z: 19, w: 4, h: 4 }, y: 2, rim: 'rail' as const, floor: 'stone' as const }];
const SLOPES = [{ id: 'orta_ramp', kind: 'ramp' as const, rect: { x: 22, z: 23, w: 4, h: 2 }, axis: 'z' as const, yFrom: 2, yTo: 0, style: 'stone' as const }];

const ctx = makeCtx('sisli_magara', DOORS, PACKS, [
  { x: START[0], z: START[1], r: 2.0 },
  { x: FONT[0], z: FONT[1], r: 1.4 },
  { x: EXIT[0], z: EXIT[1], r: 2.5 },
  { x: BOSS_1[0], z: BOSS_1[1], r: 4.0 },
  { x: BOSS_2[0], z: BOSS_2[1], r: 4.0 },
  { x: 23.5, z: 9.5, r: 1.4 }, // shrine_power
  { x: 2.5, z: 22.5, r: 1.4 }, // chest in the grave
]);
const decor = decorator(ctx, rectsOf(ROOMS));

/** Bone piles under the members of a dormant pack. */
const piles = (p: Props, packId: string): void => {
  const pk = PACKS.find((q) => q.id === packId);
  if (!pk) return;
  for (const m of pk.members) p.at(gp('bone_pile'), pk.center[0] + m.offset[0], pk.center[1] + m.offset[1], { rot: p.rnd(0, 360), tag: 'wake' });
};

decor.room('mag_giris', (p, r) => {
  // the arrival light: two torches on each side of the start, a little brighter than the default
  const arrival = lt(CAVE_TORCH, 2.4, 11, true, 0.9);
  p.torches(r, 'w', [27.5, 31.5], undefined, { light: arrival }).torches(r, 'e', [27.5, 31.5], undefined, { light: arrival }).torches(r, 'n', [8.5]);
  p.at(dg('candle_lit'), 3.2, 31.6, { light: lt(SHRINE_BLUE, 1.2, 6, true, 1.0) });
  p.at(dg('candle_thin_lit'), 3.4, 31.7);
  piles(p, 'mag_p02');
  p.scatter(5, [hw('bone_A'), hw('bone_B'), gp('bone_pile'), hw('skull')], Props.inner(r, 0.9), {}, { minDist: 0.7 });
});

decor.room('mag_tunel', (p, r) => {
  // a 2 wide corridor: torches stay on the east wall so the west door (mag_kuytu) keeps its gap
  p.torches(r, 'w', [18.5, 23.5]).torches(r, 'e', [18.5, 21.5, 24.5]);
  p.at(gp('bone_pile'), 4.2, 19.6, { rot: 30 }).at(hw('skull'), 4.6, 24.2, { rot: 120 });
});

decor.room('mag_catal', (p, r) => {
  p.torches(r, 'n', [3.5, 8.5]).torches(r, 'w', [10.5, 13.5]).torches(r, 's', [8.5, 10.5]);
  p.at(dg('candle_lit'), 9.2, 10.6, { light: lt(CAVE_TORCH, 1.4, 7, true, 1.0) });
  p.scatter(4, [hw('bone_A'), gp('rock_small'), hw('bone_C')], Props.inner(r, 1.1), {}, { minDist: 0.9, clear: 1.1 });
});

decor.room('mag_kuzey', (p, r) => {
  p.torches(r, 'n', [13.5, 16.5]);
  p.at(gp('rock_small'), 17.0, 11.0, { rot: 40 });
  p.at(gp('bone_pile'), 13.0, 10.6, { rot: 15 }).at(hw('skull'), 16.2, 8.9, { rot: 60 }).at(dg('candle_lit'), 16.6, 10.4, { light: lt(CAVE_TORCH, 1.2, 6, true, 1.0) });
});

decor.room('mag_guney', (p, r) => {
  p.torches(r, 's', [13.5, 16.5]);
  p.at(gp('rock_small'), 12.9, 16.1, { rot: 200 });
  p.at(gp('bone_pile'), 13.0, 15.4, { rot: 110 }).at(hw('bone_B'), 16.3, 14.2, { rot: 200 }).at(dg('candle_melted'), 16.6, 15.6, { rot: 30 });
});

decor.room('mag_salon', (p, r) => {
  // the hall: torches on the north and east walls, one candle by the shrine
  p.torches(r, 'n', [19.5, 22.5, 25.5]).torches(r, 'e', [9.5, 13.5, 16.5]).torches(r, 'w', [16.5]);
  p.at(dg('candle_lit'), 23.5, 9.6, { light: lt(SHRINE_BLUE, 1.5, 7, true, 1.0) });
  p.scatter(4, [hw('bone_B'), gp('bone_pile'), gp('rock_small')], Props.inner(r, 1.2), {}, { minDist: 1.0, clear: 1.1 });
});

decor.room('mag_orta', (p, r) => {
  // Morkan's arena: four pillars keep the corners open, torches on the walls
  for (const [x, z] of [[17.5, 19.5], [26.5, 19.5], [17.5, 28.5], [26.5, 28.5]] as [number, number][]) p.at(dg('pillar'), x, z, { collide: true, tag: 'pillar' });
  p.torches(r, 'w', [21.5, 24.5]).torches(r, 'e', [21.5, 24.5]).torches(r, 'n', [18.5, 26.5]);
  p.scatter(4, [hw('bone_A'), hw('skull')], Props.inner(r, 1.4), {}, { minDist: 1.2, clear: 1.2 });
});

decor.room('mag_son', (p, r) => {
  // the final room: two hooded statues flank the approach, torches along the walls
  p.at(gp('statue_hooded'), 15.5, 38.5, { collide: true, rot: 20 }).at(gp('statue_hooded'), 25.5, 38.5, { collide: true, rot: 340 });
  p.torches(r, 'w', [32.5, 36.5, 39.5]).torches(r, 'e', [32.5, 36.5, 39.5]).torches(r, 'n', [16.5, 26.5]);
  p.scatter(6, [hw('bone_A'), hw('bone_C'), gp('bone_pile')], Props.inner(r, 1.0), {}, { minDist: 0.9, clear: 1.2 });
});

decor.room('mag_kuytu', (p, r) => {
  // the grave: a chest in the corner, torches on the north and south walls
  p.torches(r, 'n', [1.5]).torches(r, 's', [1.5]);
  p.at(gp('chest_wood'), 2.5, 22.5, { rot: 90 });
  piles(p, 'mag_p11');
});

export const SISLI_MAGARA: DungeonDef = {
  id: 'sisli_magara',
  name: 'Sisli Mağara',
  shortName: 'Mağara',
  lore: 'Sisli Vadi\'nin kuzeyinde sis hiç dağılmayan bir mağara var. İçeride kadim bir oda ve ona bağlı ruhlar geçen yolcuları bekliyor. Orta Mezar\'da Sisli Çağırıcı ruhları sisin içinden çağırır; Kadim Oda\'nın son bekçisi ise hâlâ kapıyı tutuyor.',
  levelRange: [1, 10],
  timerSec: 720,
  forcesRequired: 54, // floor(0.8 x 68 total pack forces)
  trashDmgMult: 0.45,
  theme: THEME,
  grid: { w: 30, h: 42 },
  vertical: true,
  rooms: withProps(
    ROOMS.map((r) => (r.id === 'mag_orta' ? { ...r, heightAreas: HEIGHT_AREAS, slopes: SLOPES } : r)),
    decor.out,
  ),
  doors: DOORS,
  packs: PACKS,
  bosses: [
    bossAt('boss_mag_morkan', 'mag_orta', BOSS_1[0], BOSS_1[1], 0, 1),
    bossAt('boss_mag_bekci', 'mag_son', BOSS_2[0], BOSS_2[1], 180, 2),
  ],
  start: { pos: START, facing: 0 },
  exit: { pos: EXIT },
  extras: {
    fontOfPower: FONT,
    shrines: [{ type: 'shrine_power', pos: [23.5, 9.5] }, { type: 'shrine_ward', pos: [2.5, 20.5] }],
    riftSpots: [],
    /** Optional treasure: the grave chest (optional dead end, pack mag_p11) and a chest in the salon corner off the route. */
    chests: [{ pos: [2.5, 22.5], kind: 'chest_wood' }, { pos: [26, 16], kind: 'chest_iron' }],
  },
};
