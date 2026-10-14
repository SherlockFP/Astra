import type { DoorDef, DungeonDef, DungeonTheme, PackDef, RoomDef, TileRect } from '../../types/dungeons';
import type { ZoneDef } from '../../types/dungeons';
import {
  GRID_SHIFT, MOUNT_Y, Props, type PO, bossAt, circleZone, decorator, door, dg, fu, gp, hw, kg, lt, makeCtx, pack, rectsOf, pt, room, shPt, withProps,
} from './kit';

/**
 * KEMIK MAHZENI (skeleton crypt) - GDD_CONTENT 4.1. Level 8-18, M+ 13:00, 250 forces (314 available).
 * Layout (rooms / doors / packs / bosses) is generated from docs/GDD_CONTENT.layout.json; decoration is hand placed.
 * Positions are written in GDD coordinates (see the COORDINATES note in kit.ts).
 */

// ---- GENERATED from docs/GDD_CONTENT.layout.json (rooms, doors, packs, bosses) ----
const ROOMS: RoomDef[] = [
  room('giris', 'Mahzen Kapısı', 4, 33, 6, 5, 'stone_dark', 'stone', 0.3),
  room('k_giris', 'Mezar Taşları Geçidi', 5, 28, 4, 5, 'stone_dark', 'stone', 0.5),
  room('kemik_salonu', 'Kemik Salonu', 2, 17, 11, 11, 'stone', 'stone', 0.6),
  room('k_bekci', 'Bekçi Geçidi', 5, 13, 4, 4, 'stone', 'stone', 0.3),
  room('bekci_odasi', 'Bekçi Odası', 2, 1, 12, 12, 'tiles', 'stone', 0.2, { boss: 1 }),
  room('k_fener', 'Fenerli Dehliz', 14, 5, 5, 4, 'stone_dark', 'stone', 0.4),
  room('lahit_galerisi', 'Lahit Galerisi', 19, 2, 10, 12, 'stone', 'stone', 0.6),
  room('k_mum', 'Mum Yolu', 29, 5, 4, 4, 'stone_dark', 'stone', 0.4),
  room('mum_odasi', 'Mum Şapeli', 33, 2, 9, 9, 'tiles', 'brick', 0.5),
  room('k_kuyu', 'Kuyuya İniş', 35, 11, 4, 5, 'dirt', 'cave', 0.4),
  room('ruh_kuyusu', 'Ruh Kuyusu', 28, 16, 12, 12, 'stone_dark', 'stone', 0.2, { boss: 2 }),
  room('unutulmus_mezarlar', 'Unutulmuş Mezarlar', 29, 28, 9, 9, 'dirt', 'cave', 0.7, { optional: true }),
  room('k_cukur', 'Çukur Geçidi', 24, 19, 4, 4, 'stone_dark', 'stone', 0.3),
  room('ceset_cukuru', 'Ceset Çukuru', 15, 16, 9, 9, 'dirt', 'cave', 0.6),
  room('cokuk_tunel', 'Çöken Tünel', 20, 14, 2, 2, 'dirt', 'cave', 0.6, { skip: true }),
  room('k_taht', 'Taht Merdivenleri', 17, 25, 4, 4, 'tiles', 'brick', 0.2),
  room('kemik_taht', 'Kemik Taht', 14, 29, 13, 12, 'tiles', 'brick', 0.15, { boss: 3 }),
];

// ---- SCALE PILOT (docs/SCALE_REFERENCE.md section 3). Corridors were widened in cross-section and the boss / pull rooms
// enlarged. Hand placed decoration, packs, bosses and extras are still written in the OLD layout coordinates (OLD_RECT);
// they are remapped here proportionally into the new room rects (each room is scaled on its own axes), so every prop
// keeps its place relative to its room and walls keep their edges. Corridor lengths are unchanged.
type Rect4 = [number, number, number, number];
const OLD_RECT: Record<string, Rect4> = {
  giris: [4, 33, 6, 5], k_giris: [6, 28, 2, 5], kemik_salonu: [2, 17, 11, 11], k_bekci: [6, 13, 2, 4], bekci_odasi: [2, 2, 10, 11],
  k_fener: [12, 6, 5, 2], lahit_galerisi: [17, 2, 10, 12], k_mum: [27, 6, 4, 2], mum_odasi: [31, 3, 7, 8], k_kuyu: [33, 11, 2, 5],
  ruh_kuyusu: [28, 16, 10, 10], unutulmus_mezarlar: [29, 26, 9, 8], k_cukur: [24, 19, 4, 2], ceset_cukuru: [15, 17, 9, 8],
  cokuk_tunel: [20, 14, 2, 3], k_taht: [18, 25, 2, 4], kemik_taht: [14, 29, 13, 10],
};
const newRect = (id: string): Rect4 => {
  const r = ROOMS.find((q) => q.id === id)?.rect;
  if (!r) throw new Error(`[content] kemik_mahzeni: unknown room ${id}`);
  return [r.x, r.z, r.w, r.h];
};
/** Old-layout point -> new-layout point inside the same room. Tile centres: a room edge sits at centre - 0.5. */
function toNew(roomId: string, x: number, z: number): [number, number] {
  const [ox, oz, ow, oh] = OLD_RECT[roomId];
  const [nx, nz, nw, nh] = newRect(roomId);
  return [nx - 0.5 + (x - ox + 0.5) * (nw / ow), nz - 0.5 + (z - oz + 0.5) * (nh / oh)];
}
/** Old-layout point -> the room that contains it (nearest rect when it sits on a wall line), mapped into that room. */
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
/** Props for one room: at() and scatter() take old-layout coordinates; the decorator's collision and reservation lists stay in new coordinates. */
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

const DOORS: DoorDef[] = [
  door('giris', 'k_giris', 5, 33, 'n', 4, 'none'),
  door('k_giris', 'kemik_salonu', 5, 28, 'n', 4, 'none'),
  door('kemik_salonu', 'k_bekci', 5, 17, 'n', 4, 'none'),
  door('k_bekci', 'bekci_odasi', 5, 13, 'n', 4, 'boss_lock'),
  door('bekci_odasi', 'k_fener', 13, 5, 'e', 4, 'boss_exit'),
  door('k_fener', 'lahit_galerisi', 18, 5, 'e', 4, 'none'),
  door('lahit_galerisi', 'k_mum', 28, 5, 'e', 4, 'none'),
  door('k_mum', 'mum_odasi', 32, 5, 'e', 4, 'none'),
  door('mum_odasi', 'k_kuyu', 35, 10, 's', 4, 'none'),
  door('k_kuyu', 'ruh_kuyusu', 35, 15, 's', 4, 'boss_lock'),
  door('ruh_kuyusu', 'unutulmus_mezarlar', 32, 27, 's', 3, 'boss_lock'),
  door('ruh_kuyusu', 'k_cukur', 28, 19, 'w', 4, 'boss_lock'),
  door('k_cukur', 'ceset_cukuru', 24, 19, 'w', 4, 'none'),
  door('lahit_galerisi', 'cokuk_tunel', 20, 13, 's', 2, 'none'),
  door('cokuk_tunel', 'ceset_cukuru', 20, 15, 's', 2, 'none'),
  door('ceset_cukuru', 'k_taht', 17, 24, 's', 4, 'none'),
  door('k_taht', 'kemik_taht', 17, 28, 's', 4, 'boss_lock'),
];

const PACKS_RAW: PackDef[] = [
  pack('d1_p01', 'k_giris', 6.5, 30, 9, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_archer', 0, -1.25]]),
  pack('d1_p02', 'kemik_salonu', 4.5, 25, 8, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16], ['skel_rattler', 0.83, -0.53], ['skel_rattler', -0.28, 1.03], ['skel_rattler', -0.53, -1.02]]),
  pack('d1_p03', 'kemik_salonu', 10, 25, 10, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_mage', 1.02, -0.73]]),
  pack('d1_p04', 'kemik_salonu', 4, 20, 14, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.35], ['skel_archer', -0.82, -1.04], ['skel_archer', 0.03, -1.33]]),
  pack('d1_p05', 'kemik_salonu', 10, 19.5, 14, [['skel_warrior', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_mage', 0.5, -1.15]]),
  pack('d1_p06', 'kemik_salonu', 7, 22, 8, [['crypt_ghoul', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66]], { patrol: [[7, 26], [7, 18.5]] }),
  pack('d1_p07', 'k_bekci', 6.5, 14.8, 9, [['skel_warrior', 0, 0], ['skel_archer', 0, -1.25]]),
  pack('d1_p08', 'k_fener', 14, 6.5, 6, [['bone_skull', 0.3, 0], ['bone_skull', -0.38, 0.35], ['bone_skull', 0.06, -0.66], ['bone_skull', 0.48, 0.62], ['bone_skull', -0.88, -0.16], ['bone_skull', 0.83, -0.53]]),
  pack('d1_p09', 'lahit_galerisi', 19.5, 4.5, 12, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_minion', 0.48, 0.62], ['skel_mage', 1.04, -0.69]]),
  pack('d1_p10', 'lahit_galerisi', 24.5, 4.5, 13, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.35], ['crypt_wraith', 1.21, -0.3]]),
  pack('d1_p11', 'lahit_galerisi', 21.5, 8, 12, [['crypt_rat', 0.3, 0], ['crypt_rat', -0.38, 0.35], ['crypt_rat', 0.06, -0.66], ['crypt_rat', 0.48, 0.62], ['crypt_rat', -0.88, -0.16], ['crypt_rat', 0.83, -0.53], ['crypt_rat', -0.28, 1.03], ['crypt_rat', -0.53, -1.02], ['crypt_rat', 1.15, 0.42], ['crypt_rat', -1.2, 0.49], ['crypt_rat', 0.58, -1.23], ['crypt_rat', 0.43, 1.36]]),
  pack('d1_p12', 'lahit_galerisi', 19.5, 11.5, 12, [['bone_golem', 0, 0]]),
  pack('d1_p13', 'lahit_galerisi', 24.5, 11.5, 14, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_archer', 1.54, -0.1], ['skel_archer', 1.06, 0.66], ['skel_mage', 0.58, 1.43]]),
  pack('d1_p14', 'k_mum', 28.5, 6.5, 7, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_archer', 1.25, 0]]),
  pack('d1_p15', 'mum_odasi', 33, 5, 14, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['crypt_wraith', 0.84, -1.03], ['crypt_wraith', 1.3, -0.26]]),
  pack('d1_p16', 'mum_odasi', 36, 8.5, 14, [['skel_warrior', 0, 0], ['skel_mage', 1.2, 0], ['skel_mage', 0.92, 0.85]]),
  pack('d1_p17', 'mum_odasi', 32.5, 8.5, 10, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16], ['skel_rattler', 0.83, -0.53], ['skel_rattler', -0.28, 1.03], ['skel_rattler', -0.53, -1.02], ['skel_rattler', 1.15, 0.42], ['skel_rattler', -1.2, 0.49]]),
  pack('d1_p18', 'k_kuyu', 33.5, 13, 11, [['crypt_ghoul', 0.24, 0], ['crypt_ghoul', -0.3, 0.35], ['bone_skull', 0.05, -0.66], ['bone_skull', 0.38, 0.62], ['bone_skull', -0.7, -0.16]]),
  pack('d1_p19', 'unutulmus_mezarlar', 31.5, 29, 14, [['skel_minion', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['skel_minion', 0.48, 0.62], ['skel_archer', 0.09, 1.33], ['skel_archer', -0.78, 1.08]], { optional: true }),
  pack('d1_p20', 'unutulmus_mezarlar', 35.5, 31, 18, [['bone_golem', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16], ['skel_rattler', 0.83, -0.53], ['skel_rattler', -0.28, 1.03]], { optional: true }),
  pack('d1_p21', 'unutulmus_mezarlar', 31.5, 32.3, 18, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.24], ['crypt_wraith', 0.26, 0.9], ['crypt_wraith', -0.63, 0.81]], { optional: true }),
  pack('d1_p22', 'k_cukur', 25.5, 19.5, 6, [['skel_archer', 0, 0.45], ['skel_archer', 0, -0.45]]),
  pack('d1_p23', 'ceset_cukuru', 17, 18.5, 16, [['crypt_ghoul', 0.3, 0], ['crypt_ghoul', -0.38, 0.35], ['crypt_ghoul', 0.06, -0.66], ['skel_mage', -1.24, -0.19]]),
  pack('d1_p24', 'ceset_cukuru', 21.5, 22, 12, [['skel_rattler', 0.3, 0], ['skel_rattler', -0.38, 0.35], ['skel_rattler', 0.06, -0.66], ['skel_rattler', 0.48, 0.62], ['skel_rattler', -0.88, -0.16], ['skel_rattler', 0.83, -0.53], ['skel_rattler', -0.28, 1.03], ['skel_rattler', -0.53, -1.02], ['skel_mage', -0.78, 0.98]]),
  pack('d1_p25', 'ceset_cukuru', 16.8, 22.8, 15, [['skel_warrior', 0.3, 0], ['skel_minion', -0.38, 0.35], ['skel_minion', 0.06, -0.66], ['crypt_wraith', -1.12, 0.55]]),
  pack('d1_p26', 'cokuk_tunel', 20.5, 15, 6, [['crypt_rat', 0.24, 0], ['crypt_rat', -0.3, 0.35], ['crypt_rat', 0.05, -0.66], ['crypt_rat', 0.38, 0.62], ['crypt_rat', -0.7, -0.16], ['crypt_rat', 0.66, -0.53]], { optional: true }),
  pack('d1_p27', 'k_taht', 18.5, 26.5, 12, [['skel_warrior', 0.3, 0], ['skel_warrior', -0.38, 0.35]]),
];

/** Pack centres and patrol points are old-layout coordinates; members are offsets from the centre and stay as they are. */
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
  bossAtNew('boss_bekci_kaldur', 'bekci_odasi', 6.5, 6, 0, 1),
  bossAtNew('boss_olucagiran_morkan', 'ruh_kuyusu', 33, 18.5, 0, 2),
  bossAtNew('boss_azrakel', 'kemik_taht', 20, 34.5, 180, 3),
];

// fog colour (= background) lifted a step so the entry room is readable on the first frame; the void behind the walls stays dark
const THEME: DungeonTheme = { fogColor: 0x1c2422, fogNear: 8, fogFar: 38, ambient: 0x3c4a48, ambientIntensity: 0.35, hemiSky: 0x6a7a90, hemiGround: 0x201810, torchColor: 0xffa050, bloomStrength: 0.3, music: 'dungeon_crypt', palette: [0x2b2f2a, 0x5d6b5a, 0xd8d0b8, 0x7affc0, 0xffa050], tint: 0xc8d0c8 };


// ---------------------------------------------------------------------------------------------------------------------
// Decoration (hand placed, GDD coordinates). Wall props sit on the wall face (kit.wall), floor props on tile centres.
// ---------------------------------------------------------------------------------------------------------------------
const GHOST = 0x7affc0; // ghost-fire candles
const WARM = 0xffa050;  // torches

const START: [number, number] = [7, 36.5];
const FONT: [number, number] = [7, 34.2];
const EXIT: [number, number] = [20, 31];

const near = (x: number, z: number, r: number): { x: number; z: number; r: number } => {
  const [nx, nz] = at2(x, z);
  return { x: nx, z: nz, r };
};
const ctx = makeCtx('kemik_mahzeni', DOORS, PACKS, [
  near(START[0], START[1], 2.0),
  near(FONT[0], FONT[1], 1.6),
  near(EXIT[0], EXIT[1], 2.8),
  near(6.5, 6, 4.5),    // Bekci Kaldur
  near(33, 18.5, 4.5),  // Olucagiran Morkan
  near(20, 34.5, 4.5),  // Kemik Lordu Azrakel
  near(26, 2.5, 1.5),   // Kudret Sunagi
  near(37, 33, 1.5),    // Ruzgar Sunagi
]);
const decor = decorator(ctx, rectsOf(ROOMS));
/** Room callbacks get the OLD rect (their coordinates are old-layout) and a Props whose at()/scatter() remap them. */
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

// ---- giris: Mahzen Kapisi (start room) ------------------------------------------------------------------------------
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

// ---- k_giris: Mezar Taslari Gecidi -----------------------------------------------------------------------------------
D.room('k_giris', (p, r) => {
  p.wall(r, 'w', [28.2, 30.4], hw('gravestone'), { collide: true }, 0.12).wall(r, 'w', [29.3, 31.6], hw('gravemarker_A'), {}, 0.12);
  p.wall(r, 'e', [29.0, 31.2], hw('gravestone'), { collide: true }, 0.12).wall(r, 'e', [28.2, 30.2], hw('gravemarker_B'), {}, 0.12);
  p.wall(r, 'w', [31.9], gp('gravestone_c'), {}, 0.2).wall(r, 'e', [31.7], gp('gravestone_a'), {}, 0.2);
  p.torches(r, 'w', [29.0, 31.0], WARM).torches(r, 'e', [30.0, 32.0], WARM);
  p.at(dg('candle_melted'), 5.9, 29.6).at(dg('candle_melted'), 7.1, 31.0, { rot: 80 }).at(hw('bone_B'), 6.4, 28.3).at(hw('skull'), 6.9, 31.8, { rot: 200 });
  p.at(gp('chains_hanging'), 6.5, 29.4, { y: 4 }).at(gp('chains_hanging'), 6.6, 31.6, { y: 4 });
});

// ---- kemik_salonu: Ossuary hall ---------------------------------------------------------------------------------------
D.room('kemik_salonu', (p, r) => {
  // eight coffins lined up along both long walls (the walls are lined with the dead)
  for (let i = 0; i < 4; i++) {
    const z = 18.3 + i * 1.75;
    p.at(i % 2 ? hw('coffin_decorated') : hw('coffin'), 1.95, z, { collide: true, rot: 0 });
    p.at(i % 2 ? hw('coffin') : hw('coffin_decorated'), 12.05, z + 0.4, { collide: true, rot: 180 });
  }
  // dormant rattlers sleep in piles (pack d1_p02): one pile per member
  piles(p, 'd1_p02');
  bones(p, 14, Props.inner(r, 0.9), [dg('candle_melted')]);
  p.at(dg('chest'), 11.7, 17.4, { rot: 150, collide: true, tag: 'breakable', id: 'chest_salon' });
  p.at(dg('candle_triple'), 11.0, 17.2);
  p.torches(r, 'n', [3.0, 10.4], WARM).torches(r, 's', [3.0, 10.4], WARM).torches(r, 'w', [22.3]).torches(r, 'e', [22.8]);
  p.wall(r, 'n', [2.6, 11.4], dg('banner_patternA_white')).wall(r, 's', [8.6, 5.0], dg('banner_shield_white'));
  for (const [x, z] of [[5.8, 21.0], [8.4, 23.6], [3.0, 17.3], [11.0, 26.6]] as [number, number][]) candles(p, x, z);
  p.at(gp('chains_hanging'), 4.6, 22.6, { y: 4 }).at(gp('chains_hanging'), 9.4, 22.6, { y: 4 }).at(gp('chains_hanging'), 7, 19.6, { y: 4 });
  p.at(gp('statue_hooded'), 2.9, 27.0, { rot: 135, collide: true });             // a weeping mourner watching the door
  p.at(dg('rubble_half'), 10.1, 27.1, { rot: 180 }).at(dg('barrel_small'), 12.0, 26.2, { collide: true, tag: 'breakable' });
});

// ---- k_bekci: Bekci Gecidi -------------------------------------------------------------------------------------------
D.room('k_bekci', (p, r) => {
  p.wall(r, 'w', [14.0], dg('sword_shield_broken'), { y: 2.2 }).wall(r, 'e', [15.2], dg('sword_shield'), { y: 2.2 });
  p.wall(r, 'w', [15.6], dg('banner_shield_white')).wall(r, 'e', [13.4], dg('banner_shield_white'));
  p.torches(r, 'w', [13.2], WARM).torches(r, 'e', [14.4], WARM);
  p.at(hw('post_skull'), 5.9, 13.0, { rot: 0 }).at(hw('post_skull'), 7.1, 13.0, { rot: 0 });   // flanking the portcullis
  p.at(dg('candle_lit'), 6.0, 15.9, { light: lt(0xffb070, 0.9, 5, true, 1.1) }).at(hw('bone_C'), 6.9, 15.3);
});

// ---- bekci_odasi: Boss 1 arena (Bekci Kaldur) -------------------------------------------------------------------------
D.room('bekci_odasi', (p, r) => {
  for (const [x, z] of [[4, 5], [9, 5], [4, 10], [9, 10]] as [number, number][]) p.at(dg('pillar_decorated'), x, z, { collide: true, tag: 'pillar', rot: 180 });
  // corner bone piles = Mezarlik Cagrisi add spawns
  p.at(gp('bone_pile'), 3, 3, { tag: 'spawn', id: 'add_nw', rot: 30 }).at(gp('bone_pile'), 10, 3, { tag: 'spawn', id: 'add_ne', rot: 110 });
  p.at(gp('bone_pile'), 3, 11, { tag: 'spawn', id: 'add_sw', rot: 200 }).at(gp('bone_pile'), 10, 11, { tag: 'spawn', id: 'add_se', rot: 300 });
  p.at(hw('ribcage'), 3.4, 3.5, { rot: 50 }).at(hw('skull'), 9.6, 2.7).at(hw('skull'), 2.7, 11.6, { rot: 210 }).at(hw('ribcage'), 10.4, 11.4);
  p.wall(r, 'n', [6.5], dg('banner_triple_white'));                                  // behind the boss
  p.wall(r, 'n', [3.4, 9.6], dg('sword_shield_gold'), { y: 2.3 });
  p.wall(r, 'w', [4.0, 9.0], dg('sword_shield_gold'), { y: 2.3 }).wall(r, 'e', [3.3, 9.7], dg('sword_shield_gold'), { y: 2.3 });
  p.wall(r, 's', [3.0, 10.0], dg('banner_patternA_white'));
  p.torches(r, 'n', [2.4, 4.6, 8.4, 10.6], WARM).torches(r, 'w', [3.0, 7.0, 11.0], WARM).torches(r, 'e', [3.2, 9.0], WARM);
  p.at(gp('statue_hooded'), 4.5, 11.55, { rot: 180, collide: true }).at(gp('statue_hooded'), 8.5, 11.55, { rot: 180, collide: true });
  p.at(dg('barrier_half'), 1.9, 6.4, { rot: 90 }).at(dg('barrier_half'), 1.9, 7.4, { rot: 90 });
  p.at(gp('brazier'), 2.3, 1.9, { collide: true }).at(gp('brazier'), 10.7, 1.9, { collide: true });
  p.at(dg('table_long_broken'), 10.4, 8.0, { rot: 90, collide: true }).at(dg('chair'), 9.5, 7.2, { rot: -50 });
});

// ---- k_fener: Fenerli Dehliz ----------------------------------------------------------------------------------------
D.room('k_fener', (p, r) => {
  for (const x of [12.6, 14.0, 15.4]) p.at(hw('lantern_hanging'), x, 6.5, { y: 3.95, light: lt(0xffc070, 1.2, 8, true, -0.8) });
  p.wall(r, 'n', [13.0], dg('shelf_small_candles'), { y: 1.5 }).wall(r, 'n', [15.4], dg('shelf_small'), { y: 1.1 });
  p.at(dg('table_medium_broken'), 15.2, 7.0, { rot: 20, collide: true });
  p.at(dg('chair'), 14.2, 7.1, { rot: 100 }).at(dg('plate_small'), 15.1, 7.0, { y: 0.95 }).at(hw('bone_A'), 12.5, 6.2);
  p.wall(r, 's', [13.2], dg('torch_mounted'), { y: 2.5, light: lt(WARM, 2.0, 11, true, 0.9) });
});

// ---- lahit_galerisi: Sarcophagus gallery --------------------------------------------------------------------------
D.room('lahit_galerisi', (p, r) => {
  // north row: six coffins on stone daises (2 m, unwalkable)
  for (let i = 0; i < 5; i++) {
    const x = 17.8 + i * 1.6;
    p.at(dg('floor_foundation_allsides'), x, 2.75, { collide: true });
    p.at(i % 2 ? hw('coffin') : hw('coffin_decorated'), x, 2.75, { y: 2.0, scale: 0.78, rot: 90 });
  }
  // the crypt facade grows out of the north wall
  p.at(hw('crypt'), 21.5, 1.0, { scale: 0.5, collide: false, id: 'facade_crypt' });
  p.at(hw('shrine_candles'), 19.6, 2.1).at(hw('shrine_candles'), 23.6, 2.1);
  // middle row: three floor coffins the rats burst out of (pack d1_p11)
  for (let i = 0; i < 3; i++) p.at(i === 1 ? hw('coffin_decorated') : hw('coffin'), 20.2 + i * 1.3, 8.0, { rot: 90 + (i - 1) * 8, tag: 'wake' });
  // south corners
  p.at(dg('floor_foundation_allsides'), 17.4, 10.6, { collide: true }).at(hw('coffin_decorated'), 17.4, 10.6, { y: 2.0, scale: 0.78, rot: 0 });
  p.at(dg('floor_foundation_allsides'), 25.6, 10.4, { collide: true }).at(hw('coffin'), 25.6, 10.4, { y: 2.0, scale: 0.78, rot: 0 });
  // drains and rubble
  p.at(dg('floor_tile_big_grate'), 22.5, 6.0, { y: 0.02 }).at(dg('floor_tile_big_grate'), 18.5, 7.3, { y: 0.02 });
  p.at(dg('rubble_large'), 23.2, 12.4, { rot: 170, collide: true }).at(dg('rubble_half'), 17.0, 12.6, { rot: 20, collide: true }).at(dg('rubble_large'), 25.9, 7.8, { rot: 90, scale: 0.6, collide: true });
  p.torches(r, 'n', [18.0, 20.0, 23.0, 25.0], WARM).torches(r, 's', [17.9, 24.0, 26.0], WARM).torches(r, 'w', [3.0, 10.5], WARM).torches(r, 'e', [3.0, 10.8], WARM);
  p.wall(r, 'w', [2.5], dg('banner_patternB_green')).wall(r, 'e', [2.2], dg('banner_patternB_green'));
  shrine(p, 26.0, 2.5, 'crystal_purple', 0xb060ff, 'shrine_power_1');                 // Kudret Sunagi (NE corner)
  bones(p, 9, Props.inner(r, 0.9));
  candles(p, 18.3, 5.0);
  p.at(dg('candle_melted'), 24.6, 6.3, { rot: 12 });
  p.at(gp('chains_hanging'), 19.8, 9.8, { y: 4 }).at(gp('chains_hanging'), 23.2, 4.0, { y: 4 }).at(gp('chains_hanging'), 21.8, 11.5, { y: 4 });
});

// ---- k_mum: Mum Yolu -----------------------------------------------------------------------------------------------
D.room('k_mum', (p, r) => {
  p.row(dg('candle_melted'), 27.0, 5.85, 30.0, 5.85, 5, { rot: 0 });
  p.row(dg('candle_thin_lit'), 27.2, 7.15, 30.0, 7.15, 4, { light: lt(0xffb070, 0.8, 4, true, 1.1) });
  p.at(dg('candle_triple'), 28.0, 5.9, { light: lt(0xffb070, 1.0, 4.5, true, 0.8) });
  p.torches(r, 'n', [27.6, 29.6], 0xffb070).torches(r, 's', [28.6], 0xffb070);
  p.at(hw('bone_A'), 29.1, 6.8, { rot: 80 }).at(hw('skull'), 27.4, 7.0, { rot: 160 });
});

// ---- mum_odasi: Mum Sapeli ---------------------------------------------------------------------------------------------
D.room('mum_odasi', (p, r) => {
  p.at(hw('shrine'), 34, 3.4, { rot: 0, collide: true, id: 'chapel_altar', light: lt(GHOST, 1.6, 8, true, 1.9) });  // altar facing south
  p.at(dg('candle_lit'), 33.1, 3.1, { light: lt(0xffb070, 0.9, 5, true, 1.1) }).at(dg('candle_lit'), 34.9, 3.1).at(dg('candle_triple'), 34, 2.9, { y: 0 });
  // three rows of pews in the east half
  for (let row = 0; row < 3; row++) {
    const z = 6.3 + row * 1.3;
    p.at(row === 1 ? hw('bench') : hw('bench_decorated'), 34.9, z, { collide: true, rot: 0 });
    p.at(row === 1 ? hw('bench_decorated') : hw('bench'), 36.5, z, { collide: true, rot: 0 });
  }
  p.at(hw('bench'), 32.0, 6.6, { collide: true, rot: 6 }).at(hw('bench_decorated'), 31.6, 5.3, { collide: true, rot: -80 });
  piles(p, 'd1_p17', hw('bone_C'));                                                    // dormant piles under the pews (west)
  p.wall(r, 'w', [4.0, 9.0], hw('plaque_candles'), { y: 1.6 }, 0.2).wall(r, 'e', [4.0, 7.6], hw('plaque_candles'), { y: 1.6 }, 0.2);
  p.wall(r, 'n', [32.2, 35.8], fu('pictureframe_large_A'), { y: 1.7, scale: 1.3 }, 0.1).wall(r, 's', [31.6, 36.2], fu('pictureframe_large_A'), { y: 1.7, scale: 1.3 }, 0.1);
  p.wall(r, 'n', [31.4, 36.6], dg('banner_patternA_white')).wall(r, 's', [35.2], dg('banner_patternA_white'));
  p.torches(r, 'n', [33.0, 35.0], 0xffb070).torches(r, 'w', [3.6, 8.4], 0xffb070).torches(r, 'e', [4.0, 9.2], 0xffb070);
  candles(p, 33.0, 6.0);
  p.at(dg('candle_thin_lit'), 37.0, 4.3, { light: lt(GHOST, 0.9, 5, true, 1.1) });
  p.at(gp('chains_hanging'), 34, 6.8, { y: 4 });
});

// ---- k_kuyu: Kuyuya Inis ----------------------------------------------------------------------------------------------
D.room('k_kuyu', (p, r) => {
  p.at(dg('stairs_narrow'), 33.5, 11.0, { rot: 0 });
  p.at(dg('floor_dirt_small_weeds'), 32.8, 13.6).at(dg('floor_dirt_small_weeds'), 34.2, 12.2);
  p.at(dg('keyring_hanging'), 32.7, 14.0, { y: 3.6, rot: 90 }).at(dg('keyring_hanging'), 34.35, 12.6, { y: 3.6, rot: -90 });
  p.torches(r, 'w', [12.4, 14.4], WARM).torches(r, 'e', [13.4], WARM);
  p.at(gp('rock_small'), 33.0, 12.0, { rot: 30 }).at(gp('rock_small'), 34.0, 14.4, { rot: 140 }).at(hw('tree_dead_small'), 32.7, 11.5, { rot: 60 });
});

// ---- ruh_kuyusu: Boss 2 arena (Olucagiran Morkan), the soul well ---------------------------------------------------
D.room('ruh_kuyusu', (p, r) => {
  p.at(dg('floor_tile_extralarge_grates_open'), 33, 21, { y: 0.02, collide: true, id: 'soul_well', light: lt(0x60ff90, 2.0, 14, true, 0.4), vfx: 'ambient_shadow_wisps' });
  for (const [x, z] of [[30, 18], [36, 18], [30, 24], [36, 24]] as [number, number][]) p.at(dg('pillar'), x, z, { collide: true, tag: 'pillar' });
  p.ring(hw('candle_triple'), 33, 21, 2.55, 12, { light: lt(0x60ff90, 0.7, 5, true, 0.9) }, 'out');
  p.torches(r, 'n', [29.4, 36.6], 0x60ff90).torches(r, 'w', [17.4, 24.0], 0x60ff90).torches(r, 'e', [17.4, 24.0], 0x60ff90).torches(r, 's', [29.0, 37.0], 0x60ff90);
  p.at(gp('bone_pile'), 29.0, 17.2, { rot: 20 }).at(gp('bone_pile'), 37.0, 24.8, { rot: 140 }).at(hw('ribcage'), 28.8, 24.6).at(hw('skull'), 37.1, 17.1);
  p.at(hw('skull_candle'), 31.2, 20.4).at(hw('skull_candle'), 35.0, 22.0, { rot: 100 }).at(hw('skull_candle'), 33.2, 24.1, { rot: 200 });
  p.at(gp('statue_hooded'), 28.4, 21.0, { rot: 90, collide: true }).at(gp('statue_hooded'), 37.4, 21.0, { rot: -90, collide: true });
  p.at(dg('barrier_corner'), 28.6, 16.4, { rot: 0 }).at(dg('barrier_corner'), 36.6, 25.0, { rot: 180 });
});

// ---- unutulmus_mezarlar: Forgotten graves (optional dead end) ---------------------------------------------------
D.room('unutulmus_mezarlar', (p, r) => {
  const graves: [string, number, number, number][] = [
    [hw('grave_A'), 30.0, 27.0, 0], [hw('grave_B'), 33.3, 27.2, 8], [hw('grave_A_destroyed'), 35.6, 26.9, -6],
    [hw('grave_B'), 29.6, 31.4, 90], [hw('grave_A'), 33.4, 33.0, 180], [hw('grave_A_destroyed'), 36.9, 30.2, -90],
  ];
  for (const [m, x, z, rot] of graves) p.at(m, x, z, { rot, collide: true });
  const stones: [string, number, number, number][] = [
    [hw('gravestone'), 31.2, 26.6, 0], [hw('gravestone'), 34.6, 26.8, 0], [hw('gravestone'), 37.0, 27.0, 10], [hw('gravemarker_A'), 29.2, 29.4, 90],
    [hw('gravemarker_B'), 28.9, 33.0, 90], [hw('gravestone'), 31.0, 33.1, 180], [hw('gravemarker_A'), 35.2, 33.1, 180], [hw('gravemarker_B'), 37.2, 31.9, -90],
    [hw('gravestone'), 36.0, 28.8, -20], [hw('gravemarker_A'), 32.4, 30.9, 40], [gp('gravestone_c'), 34.0, 30.0, 70], [gp('gravestone_b'), 30.4, 30.2, 0],
    [gp('gravestone_a'), 35.0, 32.0, 200], [gp('gravestone_c'), 28.9, 26.4, 130],
  ];
  for (const [m, x, z, rot] of stones) p.at(m, x, z, { rot });
  p.at(hw('tree_dead_small'), 29.2, 26.4, { rot: 20 }).at(hw('tree_dead_small'), 37.0, 25.8, { rot: 200 });
  p.at(hw('fence_broken'), 34.2, 25.9, { rot: 0 }).at(hw('fence_broken'), 28.9, 28.0, { rot: 90 });
  p.at(hw('post_lantern'), 29.4, 27.4, { rot: 90 }).at(hw('post_lantern'), 37.0, 29.4, { rot: -90 });
  p.at(gp('chest_gold'), 37.0, 28.0, { rot: -90, collide: true, id: 'chest_mezarlar', tag: 'chest' });
  shrine(p, 37.0, 33.0, 'crystal_blue', 0x60e0ff, 'shrine_haste_1');                  // Ruzgar Sunagi
  p.torches(r, 'w', [27.6, 31.2], WARM);
  bones(p, 8, Props.inner(r, 0.9), [hw('skull_candle')]);
});

// ---- k_cukur: Cukur Gecidi ------------------------------------------------------------------------------------------
D.room('k_cukur', (p, r) => {
  p.wall(r, 'n', [24.6, 26.4], dg('barrier'), { y: 0 }, 0.3).wall(r, 's', [24.6, 26.4], dg('barrier'), { y: 0 }, 0.3);
  p.at(hw('bone_A'), 24.8, 19.2, { rot: 40 }).at(hw('bone_C'), 26.2, 20.0, { rot: 100 }).at(hw('bone_B'), 25.6, 19.0).at(hw('skull'), 24.3, 20.1);
  p.torches(r, 'n', [25.5], WARM).torches(r, 's', [25.3], WARM);
});

// ---- ceset_cukuru: Corpse pit ------------------------------------------------------------------------------------------
D.room('ceset_cukuru', (p, r) => {
  // sunken centre: four iron grates over the pit
  for (const [x, z] of [[19, 20], [20, 20], [19, 21], [20, 21]] as [number, number][]) p.at(dg('floor_tile_big_grate'), x, z, { y: 0.02 });
  p.at(gp('bone_pile'), 19.0, 20.0, { rot: 40 }).at(hw('ribcage'), 20.2, 21.0, { rot: 100 });                  // heaps on the grates
  p.at(hw('coffin'), 15.4, 20.2, { rot: 80, collide: true }).at(hw('coffin'), 22.9, 18.3, { rot: 20, collide: true }).at(hw('coffin'), 22.0, 23.3, { rot: 120, collide: true });
  for (const [x, z, rot] of [[17.0, 17.4, 0], [21.0, 17.4, 0], [15.2, 23.6, 90], [23.0, 21.0, 90]] as [number, number, number][]) {
    p.at(dg('keyring_hanging'), x, z, { y: 3.4, rot });                              // meat hooks
  }
  p.at(gp('chains_hanging'), 17.0, 20.5, { y: 4 }).at(gp('chains_hanging'), 21.8, 20.0, { y: 4 }).at(gp('chains_hanging'), 19.5, 18.6, { y: 4 });
  p.at(hw('skull'), 17.9, 22.4).at(hw('skull'), 21.2, 19.2, { rot: 90 }).at(hw('ribcage'), 16.0, 18.4, { rot: 200 }).at(gp('bone_pile'), 22.6, 24.0).at(gp('bone_pile'), 14.8, 17.0);
  p.at(gp('statue_hooded'), 14.9, 24.0, { rot: 45, collide: true, tint: 0x8aa090 });
  p.torches(r, 'n', [16.0, 22.2], WARM).torches(r, 's', [16.6, 21.0], WARM).torches(r, 'w', [18.0, 22.2], WARM);
  p.at(gp('cauldron'), 23.0, 24.0, { rot: 220, collide: true });
  bones(p, 9, Props.inner(r, 0.8), [hw('bone_A'), hw('bone_B')]);
});

// ---- cokuk_tunel: collapsed shortcut ------------------------------------------------------------------------------------
D.room('cokuk_tunel', (p, r) => {
  p.at(dg('rubble_half'), 19.7, 13.95, { scale: 0.7, rot: 0 }).at(dg('rubble_large'), 21.2, 16.0, { scale: 0.35, rot: 180 });
  p.at(hw('bone_A'), 20.9, 14.2, { rot: 30 }).at(hw('skull'), 19.9, 15.9).at(gp('rock_small'), 20.8, 13.8).at(gp('rock_small'), 19.8, 16.2, { rot: 80 });
  p.torches(r, 'e', [15.4], 0xd09050);
});

// ---- k_taht: Taht Merdivenleri --------------------------------------------------------------------------------------
D.room('k_taht', (p, r) => {
  p.wall(r, 'w', [26.0], dg('banner_triple_green')).wall(r, 'e', [26.0], dg('banner_triple_green'));
  p.torches(r, 'w', [25.2, 27.6], WARM).torches(r, 'e', [25.2, 27.6], WARM);
  p.at(dg('candle_triple'), 17.9, 25.0).at(dg('candle_triple'), 19.1, 25.1, { light: lt(GHOST, 0.9, 5, true, 0.8) });
  p.at(hw('bone_C'), 18.6, 27.9, { rot: 20 }).at(hw('skull'), 19.0, 25.9);
});

// ---- kemik_taht: Boss 3 arena (Kemik Lordu Azrakel) -----------------------------------------------------------------
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

// ---------------------------------------------------------------------------------------------------------------------
// Zones, per-room extras, pack flags, assembly
// ---------------------------------------------------------------------------------------------------------------------
/** Floor sigil. gi scales the glow (ring brightness and halo); the entrance one is kept low so it never reads as a light disc. */
const rune = (x: number, z: number, r: number, gi = 1.0): ZoneDef => circleZone('rune', x, z, r, { color: 0x14221c, glow: GHOST, glowIntensity: gi });

const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  giris: { ambientVfx: 'ambient_dust', zones: [rune(FONT[0], FONT[1], 1.0, 0.4)] },
  k_giris: { ambientVfx: 'ambient_dust' },
  kemik_salonu: { ambientVfx: 'ambient_dust' },
  k_bekci: {},
  bekci_odasi: { explicitDecor: true, ambientVfx: 'ambient_dust' },
  k_fener: {},
  lahit_galerisi: { ambientVfx: 'ambient_dust' },
  k_mum: { lightColor: 0xffb070 },
  mum_odasi: { lightColor: 0xffb070, ambientVfx: 'ambient_dust' },
  k_kuyu: { ambientVfx: 'ambient_dust' },
  ruh_kuyusu: {
    explicitDecor: true, lightColor: 0x60ff90, ambientVfx: 'ambient_shadow_wisps',
    zones: [circleZone('pit', ...at2(33, 21), 0.875 * 1.2, { blocked: true, color: 0x050806, glow: 0x60ff90, glowIntensity: 1.4, vfx: 'ambient_shadow_wisps' })],
  },
  unutulmus_mezarlar: { ambientVfx: 'ambient_dust' },
  k_cukur: {},
  ceset_cukuru: { ambientVfx: 'ambient_shadow_wisps', zones: [{ kind: 'pit', shape: 'rect', rect: { x: 19, z: 19, w: 2, h: 2 }, color: 0x0a0e0a, glow: 0x4a8a30, glowIntensity: 0.5 }] },
  cokuk_tunel: { ambientVfx: 'ambient_dust' },
  k_taht: {},
  kemik_taht: {
    explicitDecor: true, lightColor: GHOST, ambientVfx: 'ambient_dust',
    zones: [rune(...at2(15.5, 31), 1.1), rune(...at2(25, 31), 1.1), rune(...at2(20, 37), 1.1), circleZone('rune', ...at2(20, 33.5), 5.2, { color: 0x101a16, glow: GHOST, glowIntensity: 0.55 })],
  },
};

/** Dormant / big-pull design flags (GDD 4.1.4). */
const PACK_EXTRA: Record<string, Partial<PackDef>> = {
  d1_p02: { dormant: { kind: 'bones', wakeRadius: 6 }, big: true, note: 'Bone piles wake when a player comes within 6 m (Skeletons_Awaken_Floor).' },
  d1_p04: { big: true },
  d1_p06: { big: true, note: 'Patrol walks N-S through the hall (12 s per leg) and body-pulls into p03/p05.' },
  d1_p09: { big: true },
  d1_p11: { dormant: { kind: 'coffin', wakeRadius: 5 }, big: true, note: 'Bursts out of 3 coffins when any player enters the middle row.' },
  d1_p17: { dormant: { kind: 'bones', wakeRadius: 6 }, note: 'Dormant bone piles under the pews.' },
};

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  fontOfPower: pt(7, 34.2),
  shrines: [{ type: 'shrine_power', pos: pt(...at2(26, 2.5)) }, { type: 'shrine_haste', pos: pt(...at2(37, 33)) }],
  riftSpots: ([[8, 24], [21, 6], [34, 7], [33, 30], [19, 20], [6.5, 30]] as [number, number][]).map(([x, z]) => pt(...at2(x, z))),
  chests: [{ pos: pt(11.7, 17.4), kind: 'chest_wood' }, { pos: pt(...at2(37, 28)), kind: 'chest_gold' }],
};

export const KEMIK_MAHZENI: DungeonDef = {
  id: 'kemik_mahzeni',
  name: 'Kemik Mahzeni',
  shortName: 'Mahzen',
  lore: 'Kuzgunkale\'nin altında, unutulmuş kralların kemikleri yatar. Kemik Lordu Azrakel, ölümsüzlüğü filakterlerine bağladı ve mahzenin her köşesinde ölüleri yeniden ayağa kaldırdı. Bekçi Kaldur hâlâ kapıyı tutar; ruh kuyusu ise diriler için açlıkla fokurdar.',
  levelRange: [8, 18],
  timerSec: 790,
  forcesRequired: 250,
  theme: THEME,
  grid: { w: 44, h: 44 },
  rooms: withProps(ROOMS.map((r) => ({ ...r, ...ROOM_EXTRA[r.id] })), D.out),
  doors: DOORS,
  packs: PACKS.map((p) => (PACK_EXTRA[p.id] ? { ...p, ...PACK_EXTRA[p.id] } : p)),
  bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 180 },
  exit: { pos: shPt(...at2(EXIT[0], EXIT[1])) },
  extras: EXTRAS,
};
