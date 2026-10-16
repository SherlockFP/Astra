import type { DoorDef, DungeonDef, DungeonTheme, PackDef, RoomDef, TileRect } from '../../types/dungeons';
import type { ZoneDef } from '../../types/dungeons';
import {
  GRID_SHIFT, MOUNT_Y, Props, type PO, bossAt, circleZone, decorator, door, dg, fu, gp, hw, kg, lt, makeCtx, pack, rectsOf, pt, room, shPt, withProps,
} from './kit';

/**
 * KEMIK MAHZENI (skeleton crypt) - GDD_CONTENT 4.1. Level 8-18, M+ 13:00, 235 forces required (295 available; pack-size pass: required packs 3-6 members).
 * Restructure (WoW Midnight style): 15 rooms, 17 doors, 27 packs, 3 bosses. Tile coordinates.
 *   giris (entrance hub) -> k_giris junction -> two wings (k_bekci west, k_fener east) that both enter the Bekci Odasi arena (boss 1)
 *   -> kemik_salonu ossuary (3 trash packs on a clear pull path) -> ruh_kuyusu arena (boss 2)
 *   -> k_kuyu descent -> either k_cukur -> ceset_cukuru -> kemik_taht, or lahit_galerisi (sarcophagus gallery) -> kemik_taht (boss 3).
 *   cokuk_tunel is a collapsed shortcut (2 tile chokepoints) from the k_fener wing to the ceset pit, opened by the boss 2 kill.
 * Packs keep their member lists and forces (total 295 forces, non-optional 239). Rooms are authored in tile coordinates; OLD_RECT
 * is the frame each room's hand placed decoration is written in (identity for every room except kemik_taht, which keeps the
 * 13 x 10 frame it was decorated in and is stretched to its 13 x 12 rect).
 * Positions are written in GDD coordinates (see the COORDINATES note in kit.ts).
 */

// ---- rooms (rect in tile corners: x, z, w, h) ----
const ROOMS: RoomDef[] = [
  room('giris', 'Mahzen Kapısı', 4, 33, 6, 5, 'stone_dark', 'stone', 0.3),
  room('k_giris', 'Mezar Taşları Geçidi', 2, 28, 10, 5, 'stone_dark', 'stone', 0.5),
  room('k_bekci', 'Bekçi Geçidi', 2, 15, 4, 13, 'stone', 'stone', 0.3),
  room('k_fener', 'Fenerli Dehliz', 8, 15, 4, 13, 'stone_dark', 'stone', 0.4),
  room('bekci_odasi', 'Bekçi Odası', 1, 1, 14, 14, 'tiles', 'stone', 0.2, { boss: 1 }),
  room('kemik_salonu', 'Kemik Salonu', 15, 1, 12, 12, 'stone', 'stone', 0.6),
  room('ruh_kuyusu', 'Ruh Kuyusu', 27, 9, 14, 16, 'stone_dark', 'stone', 0.2, { boss: 2 }),
  room('k_kuyu', 'Kuyuya İniş', 30, 25, 4, 6, 'dirt', 'cave', 0.4),
  room('unutulmus_mezarlar', 'Unutulmuş Mezarlar', 36, 25, 8, 8, 'dirt', 'cave', 0.7, { optional: true }),
  room('k_cukur', 'Çukur Geçidi', 24, 25, 6, 4, 'stone_dark', 'stone', 0.3),
  room('ceset_cukuru', 'Ceset Çukuru', 15, 20, 9, 9, 'dirt', 'cave', 0.6),
  room('cokuk_tunel', 'Çöken Tünel', 12, 21, 3, 5, 'dirt', 'cave', 0.6, { skip: true }),
  room('kemik_taht', 'Kemik Taht', 14, 29, 13, 12, 'tiles', 'brick', 0.15, { boss: 3 }),
  room('lahit_galerisi', 'Lahit Galerisi', 27, 31, 9, 12, 'stone', 'stone', 0.6),
  room('mum_odasi', 'Mum Şapeli', 36, 33, 8, 10, 'tiles', 'brick', 0.5),
];

// ---- decoration frames ----
// Hand placed props are written in each room's OLD_RECT frame and remapped (proportionally) into the room's rect. Every
// room except kemik_taht is authored directly in its final rect (identity map). kemik_taht keeps the frame it was
// decorated in (13 x 10) and is stretched to its 13 x 12 rect, so its dais, throne and pillars keep their relative place.
type Rect4 = [number, number, number, number];
const OLD_RECT: Record<string, Rect4> = {
  giris: [4, 33, 6, 5], k_giris: [2, 28, 10, 5], k_bekci: [2, 15, 4, 13], k_fener: [8, 15, 4, 13], bekci_odasi: [1, 1, 14, 14],
  kemik_salonu: [15, 1, 12, 12], ruh_kuyusu: [27, 9, 14, 16], k_kuyu: [30, 25, 4, 6], unutulmus_mezarlar: [36, 25, 8, 8],
  k_cukur: [24, 25, 6, 4], ceset_cukuru: [15, 20, 9, 9], cokuk_tunel: [12, 21, 3, 5],
  kemik_taht: [14, 29, 13, 10], lahit_galerisi: [27, 31, 9, 12], mum_odasi: [36, 33, 8, 10],
};
const newRect = (id: string): Rect4 => {
  const r = ROOMS.find((q) => q.id === id)?.rect;
  if (!r) throw new Error(`[content] kemik_mahzeni: unknown room ${id}`);
  return [r.x, r.z, r.w, r.h];
};
/** Old-frame point -> new-layout point inside the same room. Tile centres: a room edge sits at centre - 0.5. */
function toNew(roomId: string, x: number, z: number): [number, number] {
  const [ox, oz, ow, oh] = OLD_RECT[roomId];
  const [nx, nz, nw, nh] = newRect(roomId);
  return [nx - 0.5 + (x - ox + 0.5) * (nw / ow), nz - 0.5 + (z - oz + 0.5) * (nh / oh)];
}
/** Point -> the room that contains it (nearest rect when it sits on a wall line), mapped into that room. */
function at2(x: number, z: number): [number, number] {
  let best = 'giris';
  let bd = Infinity;
  for (const id of Object.keys(OLD_RECT)) {
    const [ox, oz, ow, oh] = OLD_RECT[id];
    const dx = Math.max(ox - 0.5 - x, 0, x - (ox + ow - 0.5));
    const dz = Math.max(oz - 0.5 - z, 0, z - (oz + oh - 0.5));
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = id; }
  }
  return toNew(best, x, z);
}
type Area = { x0: number; z0: number; x1: number; z1: number };
/** Props for one room: at() and scatter() take old-frame coordinates; the decorator's collision and reservation lists stay in new coordinates. */
function remapProps(p: Props, roomId: string): Props {
  const host = p as unknown as { at: Props['at']; scatter: Props['scatter'] };
  const rawAt = host.at.bind(p);
  const rawScatter = host.scatter.bind(p);
  let raw = false;
  host.at = (model, x, z, o) => {
    if (raw) return rawAt(model, x, z, o);
    const [nx, nz] = toNew(roomId, x, z);
    return rawAt(model, nx, nz, o);
  };
  host.scatter = (count, models, area: Area, o, opt) => {
    const [x0, z0] = toNew(roomId, area.x0, area.z0);
    const [x1, z1] = toNew(roomId, area.x1, area.z1);
    raw = true;
    try {
      return rawScatter(count, models, { x0, z0, x1, z1 }, o, opt);
    } finally {
      raw = false;
    }
  };
  return p;
}

const BOSS_1 = 'boss_bekci_kaldur';
const BOSS_2 = 'boss_olucagiran_morkan';
const BOSS_3 = 'boss_azrakel';

/** Shortcut door: closed until the named boss dies (kill_lock), then open. Used for the collapsed tunnel (cokuk_tunel). */
const shortcut = (a: string, b: string, tx: number, tz: number, side: 'n' | 's' | 'e' | 'w', width: number): DoorDef =>
  ({ ...door(a, b, tx, tz, side, width, 'kill_lock'), opensOn: { boss: BOSS_2 } });

const DOORS: DoorDef[] = [
  // entrance hub -> junction -> two wings (k_bekci west, k_fener east) -> boss 1 arena
  door('giris', 'k_giris', 5, 33, 'n', 4, 'none'),
  door('k_giris', 'k_bekci', 2, 28, 'n', 4, 'none'),
  door('k_giris', 'k_fener', 8, 28, 'n', 4, 'none'),
  door('k_bekci', 'bekci_odasi', 2, 15, 'n', 4, 'boss_lock'),
  door('k_fener', 'bekci_odasi', 8, 15, 'n', 4, 'boss_lock'),
  // boss 1 -> ossuary (2 tile chokepoint) -> boss 2 arena
  door('bekci_odasi', 'kemik_salonu', 14, 5, 'e', 2, 'boss_exit'),
  door('kemik_salonu', 'ruh_kuyusu', 26, 9, 'e', 4, 'boss_lock'),
  // boss 2 -> descent (k_kuyu) and the optional graves
  door('ruh_kuyusu', 'k_kuyu', 30, 24, 's', 4, 'boss_exit'),
  door('ruh_kuyusu', 'unutulmus_mezarlar', 37, 24, 's', 4, 'boss_lock'),
  // descent: two ways down that rejoin at the final crypt (west corridor -> ceset pit; south sarcophagus gallery)
  door('k_kuyu', 'k_cukur', 30, 25, 'w', 4, 'none'),
  door('k_cukur', 'ceset_cukuru', 24, 25, 'w', 4, 'none'),
  door('ceset_cukuru', 'kemik_taht', 17, 28, 's', 4, 'boss_lock'),
  door('k_kuyu', 'lahit_galerisi', 30, 30, 's', 4, 'none'),
  door('lahit_galerisi', 'kemik_taht', 27, 33, 'w', 4, 'boss_lock'),
  door('lahit_galerisi', 'mum_odasi', 35, 35, 'e', 4, 'none'),
  // one-way shortcut: the collapsed tunnel opens after boss 2, from the ceset pit back to the k_fener wing (hub side)
  shortcut('k_fener', 'cokuk_tunel', 11, 21, 'e', 2),
  shortcut('ceset_cukuru', 'cokuk_tunel', 15, 21, 'w', 2),
];

const PACKS_RAW: PackDef[] = [
  pack('d1_p01', 'k_giris', 3.5, 30, 9, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_archer', 0, -1.25]]),
  pack('d1_p02', 'kemik_salonu', 19.5, 2.5, 5, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16]]),
  pack('d1_p03', 'kemik_salonu', 18.5, 9.5, 10, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_mage', 1.02, -0.73]]),
  pack('d1_p04', 'k_bekci', 3.5, 17.5, 14, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.35], ['skel_archer', -0.82, -1.04], ['skel_archer', 0.03, -1.33]]),
  pack('d1_p05', 'kemik_salonu', 23.5, 9.5, 14, [['skel_warrior', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_mage', 0.5, -1.15]]),
  pack('d1_p06', 'k_fener', 9.5, 20.5, 8, [['crypt_ghoul', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66]]),
  pack('d1_p07', 'k_bekci', 3.5, 25.5, 9, [['skel_warrior', 0, 0], ['skel_archer', 0, -1.25]]),
  pack('d1_p08', 'k_fener', 9.5, 24.5, 6, [['bone_skull', 0.3, 0], ['bone_skull', -0.38, 0.35], ['bone_skull', 0.06, -0.66], ['bone_skull', 0.48, 0.62], ['bone_skull', -0.88, -0.16], ['bone_skull', 0.83, -0.53]]),
  pack('d1_p09', 'lahit_galerisi', 29.5, 33, 12, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_minion', 0.48, 0.62], ['skel_mage', 1.04, -0.69]]),
  pack('d1_p10', 'lahit_galerisi', 33.5, 33, 13, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.35], ['crypt_wraith', 1.21, -0.3]]),
  pack('d1_p11', 'lahit_galerisi', 31.5, 36.5, 5, [['crypt_rat', 0.3, 0], ['crypt_rat', -0.38, 0.35], ['crypt_rat', 0.06, -0.66], ['crypt_rat', 0.48, 0.62], ['crypt_rat', -0.88, -0.16]]),
  pack('d1_p12', 'lahit_galerisi', 29.5, 40.5, 12, [['bone_golem', 0, 0]]),
  pack('d1_p13', 'lahit_galerisi', 33, 40.5, 14, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_archer', 1.54, -0.1], ['skel_archer', 1.06, 0.66], ['skel_mage', 0.58, 1.43]]),
  pack('d1_p14', 'mum_odasi', 38, 40.5, 7, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_archer', 1.25, 0]]),
  pack('d1_p15', 'mum_odasi', 38, 36, 14, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['crypt_wraith', 0.84, -1.03], ['crypt_wraith', 1.3, -0.26]]),
  pack('d1_p16', 'mum_odasi', 41.5, 40.5, 14, [['skel_warrior', 0, 0], ['skel_mage', 1.2, 0], ['skel_mage', 0.92, 0.85]]),
  pack('d1_p17', 'mum_odasi', 41.5, 36, 5, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16]]),
  pack('d1_p18', 'k_cukur', 26.5, 26.5, 11, [['crypt_ghoul', 0.24, 0], ['crypt_ghoul', -0.3, 0.35], ['bone_skull', 0.05, -0.66], ['bone_skull', 0.38, 0.62], ['bone_skull', -0.7, -0.16]]),
  pack('d1_p19', 'unutulmus_mezarlar', 38, 28.5, 14, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_minion', 0.48, 0.62], ['skel_archer', 0.09, 1.33], ['skel_archer', -0.78, 1.08]], { optional: true }),
  pack('d1_p20', 'unutulmus_mezarlar', 41.5, 28.5, 18, [['bone_golem', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16], ['skel_rattler', 0.83, -0.53], ['skel_rattler', -0.28, 1.03]], { optional: true }),
  pack('d1_p21', 'unutulmus_mezarlar', 37.5, 31, 18, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.24], ['crypt_wraith', 0.26, 0.9], ['crypt_wraith', -0.63, 0.81]], { optional: true }),
  pack('d1_p22', 'k_bekci', 3.5, 21.5, 6, [['skel_archer', 0, 0.45], ['skel_archer', 0, -0.45]]),
  pack('d1_p23', 'ceset_cukuru', 17.5, 21.5, 16, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.35], ['crypt_ghoul', 0.06, -0.66], ['skel_mage', -1.24, -0.19]]),
  pack('d1_p24', 'ceset_cukuru', 21.5, 23, 8, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_mage', -0.78, 0.98]]),
  pack('d1_p25', 'ceset_cukuru', 16.5, 26, 15, [['skel_warrior', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['crypt_wraith', -1.12, 0.55]]),
  pack('d1_p26', 'cokuk_tunel', 13, 23, 6, [['crypt_rat', 0.24, 0], ['crypt_rat', -0.3, 0.35], ['crypt_rat', 0.05, -0.66], ['crypt_rat', 0.38, 0.62], ['crypt_rat', -0.7, -0.16], ['crypt_rat', 0.66, -0.53]], { optional: true }),
  pack('d1_p27', 'ceset_cukuru', 20.5, 26.5, 12, [['skel_warrior', 0.3, 0], ['skel_warrior', -0.38, 0.35]]),
];

/** Pack centres and patrol points are in the room's frame; members are offsets from the centre and stay as they are. */
const remapPack = (p: PackDef): PackDef => {
  const [cx, cz] = toNew(p.roomId, p.center[0], p.center[1]);
  return { ...p, center: [cx, cz], ...(p.patrol ? { patrol: p.patrol.map(([x, z]) => toNew(p.roomId, x, z)) } : {}) };
};
const PACKS: PackDef[] = PACKS_RAW.map(remapPack);

const bossAtNew = (id: string, roomId: string, x: number, z: number, facing: number, order: number) => {
  const [nx, nz] = toNew(roomId, x, z);
  return bossAt(id, roomId, nx, nz, facing, order);
};
const BOSSES = [
  bossAt(BOSS_1, 'bekci_odasi', 7.5, 7, 0, 1),
  bossAt(BOSS_2, 'ruh_kuyusu', 33.5, 12.5, 0, 2),
  bossAtNew(BOSS_3, 'kemik_taht', 20, 34.5, 180, 3),
];

// fog colour (= background) lifted a step so the entry room is readable on the first frame; the void behind the walls stays dark
const THEME: DungeonTheme = {
  fogColor: 0x141c1a, fogNear: 8, fogFar: 38, ambient: 0x2e3a34, ambientIntensity: 0.35, hemiSky: 0x5a6e62, hemiGround: 0x181410,
  torchColor: 0xff9a48, bloomStrength: 0.3, music: 'dungeon_crypt', palette: [0x2b2f2a, 0x5d6b5a, 0xd8d0b8, 0x7affc0, 0xffa050], tint: 0xc8d0c8,
  moon: { color: 0xb8d8c0, intensity: 0.4 }, rim: { color: 0x9affd0, intensity: 0.4 },
};


// ---------------------------------------------------------------------------------------------------------------------
// Decoration (hand placed, tile coordinates). Wall props sit on the wall face (kit.wall), floor props on tile centres.
// Keep collide props off the door lanes (the content check fails on a blocked opening).
// ---------------------------------------------------------------------------------------------------------------------
const GHOST = 0x7affc0; // ghost-fire candles
const WARM = 0xffa050;  // torches

const START: [number, number] = [7, 36.5];
const FONT: [number, number] = [7, 34.2];
const EXIT: [number, number] = [20, 31];
const SOUL_WELL: [number, number] = [34.1, 22.1]; // ai/bosses/kemik.ts hard-codes this point (c.gdd(34.1, 22.1))

const near = (x: number, z: number, r: number): { x: number; z: number; r: number } => {
  const [nx, nz] = at2(x, z);
  return { x: nx, z: nz, r };
};
const ctx = makeCtx('kemik_mahzeni', DOORS, PACKS, [
  near(START[0], START[1], 2.0),
  near(FONT[0], FONT[1], 1.6),
  near(EXIT[0], EXIT[1], 2.8),
  near(7.5, 7, 4.5),     // Bekci Kaldur
  near(33.5, 12.5, 4.5), // Olucagiran Morkan
  near(20, 34.5, 4.5),   // Kemik Lordu Azrakel
  near(23, 2.5, 1.5),    // Kudret Sunagi
  near(42.6, 31.4, 1.5), // Ruzgar Sunagi
]);
const decor = decorator(ctx, rectsOf(ROOMS));
/** Room callbacks get the OLD frame rect (their coordinates are in that frame) and a Props whose at()/scatter() remap them. */
const D = {
  out: decor.out,
  room(id: string, fn: (p: Props, r: TileRect) => void): void {
    const [x, z, w, h] = OLD_RECT[id];
    decor.room(id, (p) => fn(remapProps(p, id), { x, z, w, h }));
  },
};

/** A small cluster of ghost-green candles (one real light). */
const candles = (p: Props, x: number, z: number, color = GHOST, strong = 1.0): void => {
  p.at(dg('candle_lit'), x, z, { light: lt(color, strong, 5, true, 1.1) });
  p.at(dg('candle_thin_lit'), x + 0.2, z + 0.1);
  p.at(dg('candle_melted'), x - 0.17, z + 0.15, { rot: p.rnd(0, 360) });
};

/** Bone piles exactly under the members of a dormant pack. */
const piles = (p: Props, packId: string, model = gp('bone_pile')): void => {
  const pk = PACKS_RAW.find((q) => q.id === packId);
  if (!pk) return;
  const cx = pk.center[0], cz = pk.center[1];
  for (const m of pk.members) p.at(model, cx + m.offset[0], cz + m.offset[1], { rot: p.rnd(0, 360), tag: 'wake' });
};

/** Stone altar + floating crystal + candle ring (shrines, GDD 1.4). */
const shrine = (p: Props, x: number, z: number, crystal: 'crystal_blue' | 'crystal_purple', color: number, id: string): void => {
  p.at(kg('altar-stone'), x, z, { scale: 3, collide: true, id, tag: 'shrine' });
  p.at(gp(crystal), x, z, { y: 2.0, scale: 0.55, emissive: color, light: lt(color, 1.7, 7, true, 0.7), id: `${id}_crystal` });
  p.ring(dg('candle_lit'), x, z, 0.95, 4, {}, 'out', 45);
};

const bones = (p: Props, n: number, area: { x0: number; z0: number; x1: number; z1: number }, extra: string[] = []): void => {
  p.scatter(n, [hw('bone_A'), hw('bone_B'), hw('bone_C'), hw('skull'), hw('ribcage'), gp('bone_pile'), ...extra], area, {}, { minDist: 0.7 });
};

// ---- giris: Mahzen Kapisi (start hub, landmark) -----------------------------------------------------------------------
D.room('giris', (p, r) => {
  p.at(dg('stairs_walled'), 6.5, 36.7, { id: 'stairs_up' });                       // the way back up (decorative)
  p.at(gp('font_of_power'), FONT[0], FONT[1], { collide: true, id: 'font_of_power', tag: 'socket', light: lt(GHOST, 1.1, 8, false, 2.0) });
  // the two wall torches on each side are the arrival light (about 4 m from the start): a little stronger than the default mounted torch
  const arrivalTorch = lt(WARM, 2.6, 12, true, 0.9);
  p.torches(r, 'w', [34.3, 36.3], undefined, { light: arrivalTorch }).torches(r, 'e', [34.3, 36.3], undefined, { light: arrivalTorch });
  p.wall(r, 'n', [4.6, 8.4], dg('banner_patternC_green'));
  p.wall(r, 'w', [33.3], dg('banner_thin_green')).wall(r, 'e', [33.3], dg('banner_thin_green'));
  for (const [x, z] of [[5.3, 35.1], [8.7, 35.1], [5.5, 33.6], [8.5, 33.6]] as [number, number][]) {
    p.at(dg('candle_triple'), x, z, { light: lt(0xffb070, 0.9, 5, true, 0.8) });
  }
  p.at(hw('skull_candle'), 4.3, 33.5, { rot: 40 }).at(hw('skull_candle'), 8.9, 36.6, { rot: -130 });
  p.at(hw('plaque_candles'), 4.6, 35.9, { rot: 90 });                              // memorial for the fallen delvers
  p.at(dg('barrel_small_stack'), 4.1, 37.0, { rot: 90, collide: true, tag: 'breakable' });
  p.at(dg('crates_stacked'), 9.0, 33.4, { rot: -20, collide: true, tag: 'breakable' });
  p.at(dg('sword_shield_broken'), 3.8, 35.4, { y: 2.2, rot: 90 });
  bones(p, 6, Props.inner(r, 0.7));
});

// ---- k_giris: Mezar Taslari Gecidi (junction hub between the entrance and the two wings) -----------------------------
D.room('k_giris', (p, r) => {
  p.torches(r, 'n', [6.5], WARM).torches(r, 's', [2.5, 10.5], WARM).torches(r, 'w', [29.5, 31.5], WARM).torches(r, 'e', [29.5, 31.5], WARM);
  p.wall(r, 'w', [30.5], dg('banner_thin_green')).wall(r, 'e', [30.5], dg('banner_thin_green'));
  p.at(gp('brazier'), 10.5, 31.2, { collide: true });
  p.at(hw('bone_A'), 4.4, 28.9, { rot: 40 }).at(hw('skull'), 9.4, 29.1, { rot: 200 });
  p.at(hw('post_skull'), 2.6, 31.6, { rot: 0 });
  candles(p, 3.2, 31.8);
  bones(p, 4, Props.inner(r, 0.9));
});

// ---- k_bekci: Bekci Gecidi (west wing) -------------------------------------------------------------------------------
D.room('k_bekci', (p, r) => {
  p.torches(r, 'w', [16.5, 23.5], WARM).torches(r, 'e', [19.5, 25.5], WARM);
  p.wall(r, 'w', [20.5], dg('sword_shield_broken'), { y: 2.2 });
  p.wall(r, 'e', [22.5], dg('banner_shield_white'));
  p.at(hw('bone_C'), 4.6, 15.6, { rot: 30 }).at(hw('skull'), 2.7, 26.2, { rot: 60 });
  candles(p, 4.4, 23.5);
});

// ---- k_fener: Fenerli Dehliz (east wing, lanterns) -------------------------------------------------------------------
D.room('k_fener', (p, r) => {
  p.at(hw('lantern_hanging'), 9.5, 17.5, { y: 3.95, light: lt(0xffc070, 1.2, 8, true, -0.8) });
  p.at(hw('lantern_hanging'), 9.5, 23.0, { y: 3.95, light: lt(0xffc070, 1.2, 8, true, -0.8) });
  p.torches(r, 'e', [21.5, 25.5], WARM).torches(r, 'w', [16.5, 22.5], WARM);
  p.wall(r, 'e', [19.5], dg('shelf_small_candles'), { y: 1.5 });
  p.at(hw('bone_A'), 8.6, 16.6).at(hw('skull'), 10.6, 26.2, { rot: 90 });
});

// ---- bekci_odasi: Boss 1 arena (Bekci Kaldur), round pillar ring, 14 x 14 with room to dodge -------------------------
D.room('bekci_odasi', (p, r) => {
  // eight pillars on a 4.5 tile ring around the arena centre (7.5, 7.5): the middle stays open for the dodge phases
  p.ring(dg('pillar_decorated'), 7.5, 7.5, 4.5, 8, { collide: true, tag: 'pillar', rot: 180 }, 'out');
  // corner bone piles = Mezarlik Cagrisi add spawns
  p.at(gp('bone_pile'), 2.8, 2.8, { tag: 'spawn', id: 'add_nw', rot: 30 }).at(gp('bone_pile'), 12.2, 2.8, { tag: 'spawn', id: 'add_ne', rot: 110 });
  p.at(gp('bone_pile'), 2.8, 12.2, { tag: 'spawn', id: 'add_sw', rot: 200 }).at(gp('bone_pile'), 12.2, 12.2, { tag: 'spawn', id: 'add_se', rot: 300 });
  p.at(hw('ribcage'), 2.0, 6.0, { rot: 50 }).at(hw('skull'), 12.6, 6.8).at(hw('ribcage'), 11.6, 11.6, { rot: 40 });
  p.wall(r, 'n', [7.5], dg('banner_triple_white'));                                  // behind the boss
  p.wall(r, 'n', [4.5, 10.5], dg('sword_shield_gold'), { y: 2.3 });
  p.wall(r, 'w', [4.5, 10.5], dg('sword_shield_gold'), { y: 2.3 });
  p.wall(r, 'e', [3.5, 10.5], dg('sword_shield_gold'), { y: 2.3 });
  p.wall(r, 's', [6.5], dg('banner_patternA_white'));
  p.torches(r, 'n', [3.0, 12.0], WARM).torches(r, 'w', [3.0, 7.5, 12.0], WARM).torches(r, 'e', [2.5, 11.0], WARM);
  p.at(dg('barrier_half'), 1.9, 6.4, { rot: 90 }).at(dg('barrier_half'), 1.9, 7.4, { rot: 90 });
  p.at(gp('brazier'), 2.3, 1.9, { collide: true }).at(gp('brazier'), 12.7, 1.9, { collide: true });
});

// ---- kemik_salonu: Ossuary hall (after boss 1): 3 trash packs on a clear pull path, boss 2 door on the east ----------
D.room('kemik_salonu', (p, r) => {
  // coffins lined along the south wall (the walls are lined with the dead)
  for (let i = 0; i < 5; i++) {
    const x = 16.5 + i * 2;
    p.at(i % 2 ? hw('coffin') : hw('coffin_decorated'), x, 11.3, { collide: true, rot: 0 });
  }
  piles(p, 'd1_p02');                                                               // dormant rattlers sleep in piles (pack d1_p02)
  bones(p, 12, Props.inner(r, 0.9), [dg('candle_melted')]);
  p.torches(r, 'n', [17.0, 21.0, 25.0], WARM).torches(r, 'w', [2.5, 10.5], WARM).torches(r, 'e', [2.5, 10.5], WARM);
  p.wall(r, 'n', [19.5], dg('banner_patternA_white'));
  for (const [x, z] of [[16.2, 4.2], [25.2, 4.0], [16.6, 7.6]] as [number, number][]) candles(p, x, z);
  p.at(gp('chains_hanging'), 17.0, 6.0, { y: 4 }).at(gp('chains_hanging'), 24.0, 7.0, { y: 4 });
  shrine(p, 23, 2.5, 'crystal_purple', 0xb060ff, 'shrine_power_1');                 // Kudret Sunagi (north-east of the ossuary)
  p.at(dg('barrel_small'), 25.4, 11.0, { collide: true, tag: 'breakable' }).at(dg('rubble_half'), 16.2, 10.6, { rot: 90 });
});

// ---- ruh_kuyusu: Boss 2 arena (Olucagiran Morkan), the soul well (34.1, 22.1 is fixed by the boss script) -------------
D.room('ruh_kuyusu', (p, r) => {
  const [wx, wz] = SOUL_WELL;
  p.at(dg('floor_tile_extralarge_grates_open'), wx, wz, { y: 0.02, collide: true, id: 'soul_well', light: lt(0x60ff90, 2.0, 14, true, 0.4), vfx: 'ambient_shadow_wisps' });
  for (const [x, z] of [[30.5, 14.5], [37.5, 14.5], [30.5, 20.5], [37.5, 19.5]] as [number, number][]) p.at(dg('pillar'), x, z, { collide: true, tag: 'pillar' });
  p.ring(hw('candle_triple'), wx, wz, 1.9, 10, { light: lt(0x60ff90, 0.7, 5, true, 0.9) }, 'out');
  p.torches(r, 'n', [29.5, 37.5], 0x60ff90).torches(r, 'w', [15.5, 21.5], 0x60ff90).torches(r, 'e', [10.5, 20.5], 0x60ff90).torches(r, 's', [28.5, 34.8], 0x60ff90);
  p.at(gp('bone_pile'), 29.0, 23.0, { rot: 20 }).at(gp('bone_pile'), 38.0, 10.5, { rot: 140 }).at(hw('ribcage'), 39.0, 17.0).at(hw('skull'), 28.0, 16.0);
  p.at(hw('skull_candle'), 31.0, 17.5).at(hw('skull_candle'), 36.0, 13.5).at(hw('skull_candle'), 37.0, 22.0, { rot: 200 });
  p.at(gp('statue_hooded'), 28.6, 14.8, { rot: 90, collide: true }).at(gp('statue_hooded'), 38.4, 20.0, { rot: -90, collide: true });
});

// ---- k_kuyu: Kuyuya Inis (descent after boss 2) ---------------------------------------------------------------------
D.room('k_kuyu', (p, r) => {
  p.at(dg('stairs_narrow'), 32.5, 27.0, { rot: 0 });
  p.at(dg('floor_dirt_small_weeds'), 31.0, 26.0).at(dg('floor_dirt_small_weeds'), 33.2, 29.0);
  p.at(dg('keyring_hanging'), 31.0, 26.5, { y: 3.6, rot: 90 }).at(dg('keyring_hanging'), 33.1, 28.0, { y: 3.6, rot: -90 });
  p.torches(r, 'e', [26.5, 29.0], WARM).torches(r, 'w', [29.5], WARM);
  p.at(gp('rock_small'), 33.0, 25.8, { rot: 30 }).at(hw('tree_dead_small'), 31.2, 29.4, { rot: 60 });
});

// ---- unutulmus_mezarlar: Forgotten graves (optional, off the boss 2 arena) ----------------------------------------
D.room('unutulmus_mezarlar', (p, r) => {
  const graves: [string, number, number, number][] = [
    [hw('grave_A'), 42.8, 31.2, 0], [hw('grave_B'), 36.6, 26.2, 8], [hw('grave_A_destroyed'), 42.4, 26.6, -6],
  ];
  for (const [m, x, z, rot] of graves) p.at(m, x, z, { rot, collide: true });
  const stones: [string, number, number, number][] = [
    [hw('gravestone'), 40.4, 25.8, 0], [hw('gravemarker_A'), 36.6, 29.6, 90], [gp('gravestone_c'), 43.0, 28.6, 70], [gp('gravestone_b'), 39.6, 31.4, 0],
  ];
  for (const [m, x, z, rot] of stones) p.at(m, x, z, { rot });
  p.at(hw('tree_dead_small'), 36.6, 25.6, { rot: 20 }).at(hw('tree_dead_small'), 43.0, 32.0, { rot: 200 });
  p.at(hw('fence_broken'), 39.6, 31.8, { rot: 0 });
  p.at(hw('post_lantern'), 39.4, 26.6, { rot: 90 }).at(hw('post_lantern'), 43.2, 30.6, { rot: -90 });
  p.at(gp('chest_gold'), 42.4, 26.2, { rot: -90, collide: true, id: 'chest_mezarlar', tag: 'chest' });
  shrine(p, 42.6, 31.4, 'crystal_blue', 0x60e0ff, 'shrine_haste_1');                  // Ruzgar Sunagi
  p.torches(r, 'w', [27.5, 30.5], WARM).torches(r, 'e', [26.5, 29.5], WARM).torches(r, 's', [37.5, 41.5], WARM);
  bones(p, 8, Props.inner(r, 0.9), [hw('skull_candle')]);
});

// ---- k_cukur: Cukur Gecidi (descent corridor, boss 2 to the ceset pit) ---------------------------------------------
D.room('k_cukur', (p, r) => {
  p.torches(r, 'n', [25.5, 28.5], WARM).torches(r, 's', [25.5, 28.5], WARM);
  p.at(hw('bone_A'), 24.6, 25.6, { rot: 40 }).at(hw('bone_C'), 28.2, 27.6, { rot: 100 }).at(hw('bone_B'), 25.4, 27.4).at(hw('skull'), 24.5, 27.5);
});

// ---- ceset_cukuru: Corpse pit (descent; the west shortcut and the south door to the final crypt) -------------------
D.room('ceset_cukuru', (p, r) => {
  // sunken centre: four iron grates over the pit
  for (const [x, z] of [[18, 23], [19, 23], [18, 24], [19, 24]] as [number, number][]) p.at(dg('floor_tile_big_grate'), x, z, { y: 0.02 });
  p.at(gp('bone_pile'), 18.0, 23.5, { rot: 40 }).at(hw('ribcage'), 19.5, 24.5, { rot: 100 });                  // heaps on the grates
  p.at(gp('cauldron'), 22.3, 21.2, { rot: 220, collide: true });
  for (const [x, z, rot] of [[16.8, 20.6, 0], [21.4, 20.6, 0], [22.6, 24.6, 90]] as [number, number, number][]) {
    p.at(dg('keyring_hanging'), x, z, { y: 3.4, rot });                              // meat hooks
  }
  p.at(gp('chains_hanging'), 17.0, 24.5, { y: 4 }).at(gp('chains_hanging'), 21.8, 21.8, { y: 4 });
  p.at(hw('skull'), 16.4, 27.8).at(hw('ribcage'), 15.6, 22.8, { rot: 200 }).at(gp('bone_pile'), 15.8, 25.0);
  p.torches(r, 'n', [17.5, 21.0], WARM).torches(r, 'w', [24.5, 27.0], WARM).torches(r, 'e', [21.0], WARM).torches(r, 's', [15.5, 22.5], WARM);
  bones(p, 6, Props.inner(r, 0.8), [hw('bone_A'), hw('bone_B')]);
});

// ---- cokuk_tunel: collapsed shortcut (2 tile chokepoints, opened by the boss 2 kill) ------------------------------------
D.room('cokuk_tunel', (p, r) => {
  p.at(dg('rubble_half'), 13.0, 24.3, { scale: 0.7, rot: 0 }).at(dg('rubble_large'), 12.6, 21.4, { scale: 0.35, rot: 180 });
  p.at(hw('bone_A'), 13.6, 23.6, { rot: 30 }).at(hw('skull'), 12.4, 22.8).at(gp('rock_small'), 13.4, 21.3).at(gp('rock_small'), 12.2, 24.6, { rot: 80 });
  p.torches(r, 'n', [13.0], 0xd09050);
});

// ---- kemik_taht: Boss 3 arena (Kemik Lordu Azrakel) -----------------------------------------------------------------
// (decorated in the old 13 x 10 frame, see OLD_RECT)
D.room('kemik_taht', (p, r) => {
  // throne dais (three raised blocks) and the bone throne
  for (const x of [19.45, 20.0, 20.55]) p.at(dg('floor_foundation_front'), x, 37.6, { rot: 180, collide: true });
  p.at(dg('chair'), 20, 37.6, { y: 2.0, scale: 2.0, tint: 0xd8d0c0, rot: 180, id: 'bone_throne' });
  for (const [x, z, rot] of [[18.5, 37.2, 20], [21.5, 37.0, 140], [17.9, 36.1, 200], [22.1, 36.3, 60], [19.0, 36.3, 100], [21.0, 36.2, 300]] as [number, number, number][]) {
    p.at(hw('skull'), x, z, { rot });
  }
  p.at(gp('bone_pile'), 18.2, 37.6, { rot: 10 }).at(gp('bone_pile'), 21.9, 37.7, { rot: 200 }).at(hw('ribcage'), 17.4, 37.3, { rot: 70 }).at(hw('ribcage'), 22.7, 37.2, { rot: -60 });
  // phylactery sockets
  const sockets: [number, number][] = [[15.5, 31], [25, 31], [20, 37]];
  sockets.forEach(([x, z], i) => {
    p.at(hw('candle_triple'), x, z, { id: `phylactery_${i + 1}`, tag: 'phylactery', light: lt(GHOST, 1.4, 7, true, 0.9) });
    p.ring(hw('candle_melted'), x, z, 0.8, 4, {}, 'out', 30);
  });
  // pillars along the side walls (cover for the spear phase)
  for (const z of [32.4, 35.0, 37.4]) p.at(dg('pillar'), 14.9, z, { collide: true, tag: 'pillar' }).at(dg('pillar'), 25.1, z, { collide: true, tag: 'pillar' });
  p.torches(r, 'n', [14.8, 22.0, 24.6], WARM, { id: 'phase_torch' }).torches(r, 'w', [30.0, 33.7, 36.2], WARM, { id: 'phase_torch' }).torches(r, 'e', [30.0, 33.7, 36.2], WARM, { id: 'phase_torch' });
  p.wall(r, 's', [15.6, 24.4], dg('torch_mounted'), { y: MOUNT_Y, id: 'phase_torch' });
  p.wall(r, 'n', [15.4, 24.2], dg('banner_triple_white')).wall(r, 'w', [34.5], dg('banner_triple_white')).wall(r, 'e', [34.5], dg('banner_triple_white'));
  p.wall(r, 's', [17.0, 23.0], dg('banner_patternA_white'));
  p.at(gp('brazier'), 16.9, 29.4, { collide: true }).at(gp('brazier'), 23.1, 29.4, { collide: true });
  p.at(gp('statue_hooded'), 14.6, 29.8, { rot: 135, collide: true, tint: 0xb8c4b8 }).at(gp('statue_hooded'), 25.4, 29.8, { rot: -135, collide: true, tint: 0xb8c4b8 });
  p.at(dg('rubble_large'), 24.4, 37.9, { rot: 200, scale: 0.7 }).at(dg('sword_shield_broken'), 16.0, 33.0, { y: 2.3, rot: 90 });
  bones(p, 12, Props.inner(r, 1.0));
  p.at(gp('chains_hanging'), 17.0, 33.0, { y: 4 }).at(gp('chains_hanging'), 23.0, 33.0, { y: 4 }).at(gp('chains_hanging'), 20.0, 30.6, { y: 4 });
});

// ---- lahit_galerisi: Sarcophagus gallery (descent side, south of k_kuyu; second way into the final crypt) ----------
D.room('lahit_galerisi', (p, r) => {
  // sarcophagi standing against the west wall, south of the crypt door
  p.at(hw('coffin_decorated'), 27.6, 39.2, { rot: 90, collide: true }).at(hw('coffin'), 27.6, 41.3, { rot: 90, collide: true });
  // dormant rats wake from three floor coffins (pack d1_p11)
  p.at(hw('coffin_decorated'), 30.2, 35.0, { rot: 90, tag: 'wake' }).at(hw('coffin'), 33.0, 36.4, { rot: 90, tag: 'wake' }).at(hw('coffin'), 31.5, 38.6, { rot: 0, tag: 'wake' });
  bones(p, 9, Props.inner(r, 0.9));
  candles(p, 28.6, 31.8);
  candles(p, 34.2, 41.2);
  p.at(dg('candle_melted'), 28.2, 37.2, { rot: 12 });
  p.at(gp('chains_hanging'), 29.0, 33.0, { y: 4 }).at(gp('chains_hanging'), 33.0, 31.8, { y: 4 }).at(gp('chains_hanging'), 31.0, 41.0, { y: 4 });
  p.torches(r, 'n', [28.5, 34.5], WARM).torches(r, 's', [29.5, 32.5], WARM).torches(r, 'w', [31.0, 38.5], WARM).torches(r, 'e', [32.5, 40.5], WARM);
  p.wall(r, 'w', [40.0], dg('banner_patternB_green'));
  p.wall(r, 'e', [37.0], dg('banner_patternB_green'));
});

// ---- mum_odasi: Mum Sapeli (chapel, dead end off the gallery) ---------------------------------------------------------
D.room('mum_odasi', (p, r) => {
  p.at(hw('shrine'), 41.5, 33.6, { rot: 0, collide: true, id: 'chapel_altar', light: lt(GHOST, 1.6, 8, true, 1.9) });  // altar on the north side
  p.at(dg('candle_lit'), 39.0, 33.8, { light: lt(0xffb070, 0.9, 5, true, 1.1) }).at(dg('candle_lit'), 43.0, 33.8).at(dg('candle_triple'), 41.5, 34.9, { y: 0 });
  p.at(hw('bench'), 42.4, 38.5, { collide: true, rot: 90 });
  piles(p, 'd1_p17', hw('bone_C'));                                                    // dormant piles under the pews (pack d1_p17)
  p.wall(r, 'n', [37.5, 39.5], dg('banner_patternA_white'));
  p.wall(r, 'n', [39.5], hw('plaque_candles'), { y: 1.6 }, 0.2);
  p.wall(r, 'e', [37.5, 40.5], fu('pictureframe_large_A'), { y: 1.7, scale: 1.3 }, 0.1);
  p.torches(r, 'n', [37.0, 40.0], 0xffb070).torches(r, 'w', [33.5, 40.5], 0xffb070);
  candles(p, 38.0, 40.0);
  p.at(dg('candle_thin_lit'), 37.0, 34.0, { light: lt(GHOST, 0.9, 5, true, 1.1) });
  p.at(gp('chains_hanging'), 39.5, 36.0, { y: 4 });
});

// ---------------------------------------------------------------------------------------------------------------------
// Zones, per-room extras, pack flags, assembly
// ---------------------------------------------------------------------------------------------------------------------
/** Floor sigil. gi scales the glow (ring brightness and halo); the entrance one is kept low so it never reads as a light disc. */
const rune = (x: number, z: number, r: number, gi = 1.0): ZoneDef => circleZone('rune', x, z, r, { color: 0x14221c, glow: GHOST, glowIntensity: gi });

/**
 * Azrakel's raised dais (2 m, stone ramp on the north edge), in the room's tile coordinates. Props inside it that have no
 * explicit height stand on its top (liftOnDais); the throne chair already sat at y 2.
 */
const BOSS_DAIS = { id: 'azrakel_dais', rect: { x: 16, z: 34, w: 8, h: 6 }, y: 2, rim: 'rail' as const, floor: 'tiles' as const };
const BOSS_RAMP = { id: 'azrakel_ramp', kind: 'ramp' as const, rect: { x: 18, z: 32, w: 4, h: 2 }, axis: 'z' as const, yFrom: 0, yTo: 2, style: 'stone' as const };

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { ambientVfx: 'ambient_dust', zones: [rune(FONT[0], FONT[1], 1.0, 0.4)] },
  k_giris: { ambientVfx: 'ambient_dust' },
  k_bekci: {},
  k_fener: {},
  bekci_odasi: { explicitDecor: true, ambientVfx: 'ambient_dust' },
  kemik_salonu: { ambientVfx: 'ambient_dust', ceiling: 10 },
  ruh_kuyusu: {
    explicitDecor: true, lightColor: 0x60ff90, ambientVfx: 'ambient_shadow_wisps',
    zones: [circleZone('pit', SOUL_WELL[0], SOUL_WELL[1], 0.875 * 1.2, { blocked: true, color: 0x050806, glow: 0x60ff90, glowIntensity: 1.4, vfx: 'ambient_shadow_wisps' })],
  },
  k_kuyu: { ambientVfx: 'ambient_dust' },
  unutulmus_mezarlar: { ambientVfx: 'ambient_dust' },
  k_cukur: {},
  ceset_cukuru: { ambientVfx: 'ambient_shadow_wisps', zones: [{ kind: 'pit', shape: 'rect', rect: { x: 18, z: 23, w: 2, h: 2 }, color: 0x0a0e0a, glow: 0x4a8a30, glowIntensity: 0.5 }] },
  cokuk_tunel: { ambientVfx: 'ambient_dust' },
  kemik_taht: {
    explicitDecor: true, lightColor: GHOST, ambientVfx: 'ambient_dust',
    heightAreas: [BOSS_DAIS], slopes: [BOSS_RAMP], ceiling: 10,
    zones: [rune(...at2(15.5, 31), 1.1), rune(...at2(25, 31), 1.1), rune(...at2(20, 37), 1.1), circleZone('rune', ...at2(20, 33.5), 5.2, { color: 0x101a16, glow: GHOST, glowIntensity: 0.55 })],
  },
  lahit_galerisi: { ambientVfx: 'ambient_dust' },
  mum_odasi: { lightColor: 0xffb070, ambientVfx: 'ambient_dust' },
};

/** Dormant / big-pull design flags (GDD 4.1.4). */
const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  d1_p02: { dormant: { kind: 'bones', wakeRadius: 6 }, big: true, note: 'Bone piles wake when a player comes within 6 m (Skeletons_Awaken_Floor). North pack on the clear ossuary pull path.' },
  d1_p04: { big: true },
  d1_p05: { note: 'South pack on the ossuary pull path (the clear lane runs along z 4 to 8).' },
  d1_p06: { big: true, note: 'East wing, the first pull on the way to boss 1.' },
  d1_p09: { big: true },
  d1_p11: { dormant: { kind: 'coffin', wakeRadius: 5 }, big: true, note: 'Bursts out of 3 coffins when any player enters the gallery.' },
  d1_p17: { dormant: { kind: 'bones', wakeRadius: 6 }, note: 'Dormant bone piles under the chapel pews.' },
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(7, 34.2),
  shrines: [{ type: 'shrine_power', pos: pt(23, 2.5) }, { type: 'shrine_haste', pos: pt(42.6, 31.4) }],
  riftSpots: ([[8, 24], [21, 6], [34, 12], [33, 36], [19, 22], [6.5, 30]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [{ pos: pt(16.4, 9.2), kind: 'chest_wood' }, { pos: pt(25.5, 10.5), kind: 'chest_iron' }, { pos: pt(42.4, 26.2), kind: 'chest_gold' }],
};

/** Props standing inside a room's height area with no explicit y are set to that area's top (the dais floor and its bones). */
function liftOnDais(rooms: RoomDef[]): RoomDef[] {
  return rooms.map((r) => {
    const areas = r.heightAreas ?? [];
    if (areas.length === 0 || !r.props) return r;
    const props = r.props.map((p) => {
      if (p.y !== undefined) return p;
      const [x, z] = p.pos;
      const a = areas.find((h) => x >= h.rect.x && x <= h.rect.x + h.rect.w && z >= h.rect.z && z <= h.rect.z + h.rect.h);
      return a ? { ...p, y: a.y } : p;
    });
    return { ...r, props };
  });
}

export const KEMIK_MAHZENI: DungeonDef = {
  id: 'kemik_mahzeni',
  name: 'Kemik Mahzeni',
  shortName: 'Mahzen',
  lore: 'Kuzgunkale\'nin altında, unutulmuş kralların kemikleri yatar. Kemik Lordu Azrakel, ölümsüzlüğü filakterlerine bağladı ve mahzenin her köşesinde ölüleri yeniden ayağa kaldırdı. Bekçi Kaldur hâlâ kapıyı tutar; ruh kuyusu ise diriler için açlıkla fokurdar.',
  levelRange: [8, 18],
  timerSec: 790,
  forcesRequired: 235,
  theme: THEME,
  grid: { w: 44, h: 44 },
  vertical: true, // the Azrakel dais (heightAreas) needs the vertical nav; the rest of the dungeon is flat
  rooms: liftOnDais(withProps(ROOMS.map((r) => ({ ceiling: 10, ...r, ...ROOM_EXTRA[r.id] })), D.out)), // vertical mode wants a ceiling per room
  doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)),
  bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 180 },
  exit: { pos: shPt(...at2(EXIT[0], EXIT[1])) },
  extras: EXTRAS,
};
