import type { DecorTier, DoorDef, DungeonDef, DungeonNpcDef, DungeonTheme, HeightArea, PackDef, RoomDef, SlopeDef, ZoneDef } from '../../types/dungeons';
import { TILE_SIZE } from '../../types/dungeons';
import '../enemies_yildiz_divani';
import { G } from '../../game/G';
import { RNG, hashString } from '../../core/utils';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { DungeonEventStore } from '../../systems/DungeonEvents';
import { type MemberTuple, pack, sunflower } from './kit';
import {
  Props, bossAt, chandelier, chr, circleZone, decorator, door, dg, fu, gp, hw, ip, kc, kf, kg, lift, lt, makeCtx, npcm, plateau, pt, ramp, rectsOf, rectZone, room, shPt, stairs, withProps,
} from './kit';

/**
 * YILDIZ DIVANI (yildiz_divani): Mythic+ season 1 dungeon, design docs/dungeons/yildiz_divani.md (Court of Stars model).
 * Level 55-60, endgame (no Normal), timer 30:00, 450 forces required (570 on packs). 21 rooms, 22 doors, 44 packs,
 * 3 bosses (Gerdan, Taliksa with her emissaries, Melandros). Rezil Gerenth is an event unit, spawned by the spy hunt (attachYildizSpy).
 * Coordinates are the doc's (it already applies its +2 z shift). Eight floor levels from -1.5 m to 16.8 m.
 * OWNER: content module. Registration lines for src/data/dungeons/index.ts are in the orchestrator report.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Rooms (doc 3.1). floorY = base height (m); ceiling = clear height above the highest floor; openAir = open sky room.
// ---------------------------------------------------------------------------------------------------------------------
const ROOMS: RoomDef[] = [
  room('iskele', 'Ay Işığı İskelesi', 20, 66, 14, 9, 'tiles', 'temple', 0.3, { floorY: 0, openAir: true }),
  room('kanal_kemeri', 'Kanal Kemeri', 14, 69, 6, 2, 'stone_dark', 'brick', 0.2, { floorY: 0, ceiling: 6 }),
  room('kanallar', 'Mana Kanalları', 2, 60, 12, 15, 'stone_dark', 'brick', 0.4, { floorY: -1.5, openAir: true, explicitDecor: true }),
  room('su_kemeri', 'Su Kemeri', 7, 54, 2, 6, 'stone_dark', 'brick', 0.3, { floorY: -1.5, ceiling: 8 }),
  room('kemer_avlusu', 'Kemer Avlusu', 2, 43, 12, 11, 'stone', 'temple', 0.4, { floorY: 2.4, openAir: true }),
  room('mana_yuvasi', 'Mana Yuvası', 14, 61, 6, 6, 'dirt', 'cave', 0.2, { floorY: -1.5, ceiling: 10, optional: true }),
  room('bahce_yolu', 'Sarmaşık Kemeri', 26, 61, 2, 5, 'stone', 'temple', 0.2, { floorY: 0, ceiling: 6 }),
  room('bahce', 'Ay Bahçesi', 16, 52, 24, 9, 'stone', 'temple', 0.6, { floorY: 2.4, openAir: true, explicitDecor: true }),
  room('hizmetci_avlusu', 'Hizmetçi Avlusu', 40, 52, 14, 9, 'dirt', 'brick', 0.5, { floorY: 2.4, openAir: true, optional: true }),
  room('yaldizli_carsi', 'Yaldızlı Çarşı', 14, 38, 24, 14, 'tiles', 'temple', 0.2, { floorY: 4.8, openAir: true, boss: 1, explicitDecor: true }),
  room('fel_gecidi', 'Zümrüt Geçit', 38, 42, 6, 2, 'stone_dark', 'cave', 0.2, { floorY: 3.6, ceiling: 8 }),
  room('gece_mahkemesi', 'Gece Mahkemesi', 44, 36, 14, 14, 'tiles', 'temple', 0.2, { floorY: 3.6, openAir: true, boss: 2, explicitDecor: true }),
  room('servis_a', 'Hizmet Koridoru', 38, 37, 6, 2, 'wood', 'brick', 0.2, { floorY: 3.6, ceiling: 6, skip: true }),
  room('servis_b', 'Hizmet Merdiveni', 38, 32, 2, 5, 'wood', 'brick', 0.3, { floorY: 3.6, ceiling: 10, skip: true }),
  room('kuzey_kemeri', 'Kuzey Kemeri', 50, 31, 2, 5, 'stone', 'temple', 0.3, { floorY: 3.6, ceiling: 8 }),
  room('ev_girisi', 'Cevher Konağı Girişi', 44, 21, 16, 10, 'tiles', 'brick', 0.4, { floorY: 7.2, ceiling: 16, explicitDecor: true }),
  room('rasathane', 'Rasathane', 46, 12, 12, 9, 'tiles', 'temple', 0.2, { floorY: 9.6, ceiling: 18, optional: true }),
  room('ziyafet_salonu', 'Ziyafet Salonu', 14, 19, 30, 13, 'tiles', 'brick', 0.3, { floorY: 7.2, ceiling: 24, explicitDecor: true }),
  room('bati_salonu', 'Batı Salonu', 4, 21, 10, 9, 'wood', 'brick', 0.4, { floorY: 7.2, ceiling: 12, optional: true }),
  room('kule_merdiveni', 'Kule Asansörü', 28, 14, 4, 5, 'tiles', 'temple', 0.3, { floorY: 7.2, ceiling: 14 }),
  room('balkon', 'Balkonlar', 20, 2, 20, 12, 'tiles', 'temple', 0.2, { floorY: 16.8, openAir: true, boss: 3, explicitDecor: true }),
];

// ---------------------------------------------------------------------------------------------------------------------
// Height data (doc 3.0). Ramp and stair strips run inside their room; heightAreas are absolute floor heights.
// Strip rule: yFrom is the height at the MIN edge of `axis`, yTo at the MAX edge.
// ---------------------------------------------------------------------------------------------------------------------
const SLOPES: Record<string, SlopeDef[]> = {
  kanal_kemeri: [ramp({ x: 14, z: 69, w: 6, h: 2 }, 'x', -1.5, 0.0, { id: 'r_kanal' })],
  su_kemeri: [stairs({ x: 7, z: 54, w: 2, h: 6 }, 'z', 2.4, -1.5, { id: 'r_su' })],
  bahce_yolu: [ramp({ x: 26, z: 61, w: 2, h: 5 }, 'z', 2.4, 0.0, { id: 'r_sarmasik' })],
  kemer_avlusu: [stairs({ x: 10, z: 46, w: 4, h: 3 }, 'x', 2.4, 4.8, { id: 'r_avlu_e' })],
  bahce: [stairs({ x: 24, z: 52, w: 4, h: 3 }, 'z', 4.8, 2.4, { id: 'r_bahce_n' })],
  fel_gecidi: [ramp({ x: 38, z: 42, w: 6, h: 2 }, 'x', 4.8, 3.6, { id: 'r_fel' })],
  kuzey_kemeri: [stairs({ x: 50, z: 31, w: 2, h: 5 }, 'z', 7.2, 3.6, { id: 'r_kuzey' })],
  servis_b: [stairs({ x: 38, z: 32, w: 2, h: 5 }, 'z', 7.2, 3.6, { id: 'r_servis_b' })],
  ev_girisi: [
    stairs({ x: 46, z: 21, w: 3, h: 2 }, 'x', 7.2, 9.6, { id: 'r_foyer_w' }),
    stairs({ x: 53, z: 21, w: 3, h: 2 }, 'x', 9.6, 7.2, { id: 'r_foyer_e' }),
  ],
};

const HEIGHTS: Record<string, HeightArea[]> = {
  // ballroom: stage dais +0.45 with a +0.9 top, and the sunken dance floor (-0.45); the rect is the r 5.5 circle's box
  ziyafet_salonu: [
    plateau({ x: 15, z: 19, w: 8, h: 3 }, 7.65, 'ledge', 'stage_low'),
    plateau({ x: 16, z: 19, w: 6, h: 2 }, 8.1, 'ledge', 'stage_high'),
    plateau({ x: 23, z: 19, w: 11, h: 11 }, 6.75, 'none', 'dance_floor'),
  ],
  ev_girisi: [plateau({ x: 49, z: 21, w: 4, h: 2 }, 9.6, 'rail', 'mezzanine')],
  kule_merdiveni: [plateau({ x: 28, z: 14, w: 4, h: 2 }, 16.8, 'rail', 'upper_landing')],
  gece_mahkemesi: [plateau({ x: 51, z: 38, w: 4, h: 4 }, 4.05, 'none', 'altar')],
  balkon: [plateau({ x: 20, z: 3, w: 4, h: 4 }, 17.25, 'none', 'nightwell_dais')],
};

const TIERS: Record<string, DecorTier[]> = {
  yaldizli_carsi: [{ kind: 'colonnade', y: 8, rect: { x: 16, z: 40, w: 20, h: 10 }, depth: 2 }],
  gece_mahkemesi: [{ kind: 'ring', y: 5.0, rect: { x: 44, z: 36, w: 14, h: 14 }, depth: 2 }],
  ev_girisi: [{ kind: 'gallery', y: 12, rect: { x: 44, z: 21, w: 16, h: 10 }, depth: 2 }],
  ziyafet_salonu: [{ kind: 'gallery', y: 14, rect: { x: 14, z: 19, w: 30, h: 13 }, depth: 3 }],
  bati_salonu: [{ kind: 'gallery', y: 11, rect: { x: 4, z: 21, w: 10, h: 9 }, depth: 1.5 }],
};

const DOORS: DoorDef[] = [
  door('iskele', 'bahce_yolu', 26, 66, 'n', 2, 'none'),
  door('bahce_yolu', 'bahce', 26, 61, 'n', 2, 'none'),
  { ...door('bahce', 'yaldizli_carsi', 25, 52, 'n', 3, 'boss_lock'), gateStyle: 'arcane' },
  door('iskele', 'kanal_kemeri', 20, 69, 'w', 2, 'none'),
  door('kanal_kemeri', 'kanallar', 14, 69, 'w', 2, 'none'),
  door('kanallar', 'su_kemeri', 7, 60, 'n', 2, 'none'),
  door('su_kemeri', 'kemer_avlusu', 7, 54, 'n', 2, 'none'),
  { ...door('kemer_avlusu', 'yaldizli_carsi', 13, 46, 'e', 3, 'boss_lock'), gateStyle: 'arcane' },
  door('kanallar', 'mana_yuvasi', 13, 65, 'e', 2, 'none'),
  door('bahce', 'hizmetci_avlusu', 39, 55, 'e', 2, 'none'),
  { ...door('yaldizli_carsi', 'fel_gecidi', 37, 42, 'e', 2, 'boss_exit'), gateStyle: 'arcane' },
  { ...door('fel_gecidi', 'gece_mahkemesi', 43, 42, 'e', 2, 'boss_lock'), gateStyle: 'fel' },
  { ...door('gece_mahkemesi', 'kuzey_kemeri', 50, 36, 'n', 2, 'boss_exit'), gateStyle: 'fel' },
  door('kuzey_kemeri', 'ev_girisi', 50, 31, 'n', 2, 'none'),
  door('ev_girisi', 'ziyafet_salonu', 44, 24, 'w', 3, 'none'),
  door('bati_salonu', 'ziyafet_salonu', 13, 24, 'e', 2, 'none'),
  door('ev_girisi', 'rasathane', 50, 21, 'n', 2, 'none'),
  { ...door('ziyafet_salonu', 'kule_merdiveni', 29, 19, 'n', 2, 'event_lock'), event: 'spy_solved', gateStyle: 'arcane' },
  { ...door('kule_merdiveni', 'balkon', 29, 14, 'n', 2, 'boss_lock'), gateStyle: 'arcane' },
  { ...door('gece_mahkemesi', 'servis_a', 44, 37, 'w', 2, 'boss_exit'), gateStyle: 'wood' },
  door('servis_a', 'servis_b', 38, 37, 'n', 2, 'none'),
  { ...door('servis_b', 'ziyafet_salonu', 38, 32, 'n', 2, 'event_lock'), event: 'servis_kilidi', gateStyle: 'wood' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Packs (doc 4.3). Unit codes: G guard, A arcanist, R healer, C construct, F enforcer, M mistress, D duelist, E eye,
// W mana wyrm, P feeder, S saber, H hound. Members sit on the sunflower spiral, elites and tanks first.
// ---------------------------------------------------------------------------------------------------------------------
const UNIT: Record<string, string> = {
  G: 'ys_nobet_muhafizi', A: 'ys_nobet_buyucusu', R: 'ys_gece_rahibi', C: 'ys_koruyucu_yapi', F: 'ys_fel_cellat', M: 'ys_golge_hanim',
  D: 'ys_duellocu', E: 'ys_dehset_gozu', W: 'ys_mana_ejderi', P: 'ys_mana_yutan', S: 'ys_mana_kilici', H: 'ys_zumrut_kopek',
};
const ORDER = 'CFMDEARGHSWP';

/** 'G2 A1' -> spiral member tuples, elites and tanks first. */
function members(spec: string): MemberTuple[] {
  const codes: string[] = [];
  for (const tok of spec.split(' ')) {
    const n = Number(tok.slice(1));
    for (let i = 0; i < n; i++) codes.push(tok[0]);
  }
  codes.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const t = sunflower(codes.length);
  return codes.map((c, i) => [UNIT[c], t[i][0], t[i][1]] as MemberTuple);
}

type PackRow = [id: string, room: string, cx: number, cz: number, spec: string, extra?: Partial<PackDef>];
const PACK_ROWS: PackRow[] = [
  ['ys_p01', 'iskele', 22.5, 71.5, 'W2'],
  ['ys_p02', 'iskele', 26.5, 67.5, 'G2 A1', { patrol: [[21.5, 67.5], [31.5, 67.5]] }],
  ['ys_p03', 'bahce_yolu', 26.5, 63, 'G2'],
  ['ys_p04', 'bahce', 24, 55.5, 'C1 S2', { big: true }],
  ['ys_p05', 'bahce', 20, 55, 'A1 R1 G1', { big: true }],
  ['ys_p06', 'bahce', 34, 55, 'E1 G1', { big: true }],
  ['ys_p07', 'bahce', 27, 59.5, 'S2', { patrol: [[18, 59.5], [37, 59.5]] }],
  ['ys_p08', 'hizmetci_avlusu', 47, 56, 'F1 H1', { optional: true }],
  ['ys_p09', 'hizmetci_avlusu', 43, 54, 'M1 W2', { optional: true }],
  ['ys_p10', 'hizmetci_avlusu', 51, 59, 'H1', { optional: true }],
  ['ys_p11', 'kanal_kemeri', 16.5, 69.5, 'P4'],
  ['ys_p12', 'kanallar', 6, 71, 'P6', { dormant: { kind: 'egg', wakeRadius: 6 } }],
  ['ys_p13', 'kanallar', 8, 66, 'E1 W1'],
  ['ys_p14', 'su_kemeri', 7.5, 56.5, 'G1'],
  ['ys_p15', 'kemer_avlusu', 5, 48, 'A1 E1'],
  ['ys_p16', 'mana_yuvasi', 17, 64, 'P8', { dormant: { kind: 'egg', wakeRadius: 6 }, optional: true }],
  ['ys_p17', 'yaldizli_carsi', 19, 46, 'G2 A2 E1', { big: true }],
  ['ys_p18', 'yaldizli_carsi', 33, 46, 'F1 H2'],
  ['ys_p19', 'yaldizli_carsi', 22, 41, 'W4 E1 S1', { big: true }],
  ['ys_p20', 'yaldizli_carsi', 30, 45, 'G3 M1', { big: true, patrol: [[30, 49.5], [30, 40.5]] }],
  ['ys_p21', 'yaldizli_carsi', 33, 41, 'D1 R1 G1'],
  ['ys_p22', 'fel_gecidi', 39.5, 42.5, 'H4', { linkedTo: ['ys_p23'] }],
  ['ys_p23', 'fel_gecidi', 42, 42.5, 'F1 H3', { linkedTo: ['ys_p22'] }],
  ['ys_p24', 'gece_mahkemesi', 46, 48, 'M2 H2'],
  ['ys_p25', 'gece_mahkemesi', 55, 48, 'F2 G1'],
  ['ys_p26', 'kuzey_kemeri', 50.5, 33, 'E1 A1 W1'],
  ['ys_p27', 'ev_girisi', 46.5, 25.5, 'C2'],
  ['ys_p28', 'ev_girisi', 56, 25, 'A2 G2 E1'],
  ['ys_p29', 'ev_girisi', 51.5, 23.5, 'G2', { patrol: [[46, 23.5], [57, 23.5]] }],
  ['ys_p30', 'ev_girisi', 56, 28.5, 'D1 R1'],
  ['ys_p31', 'ziyafet_salonu', 18, 29, 'M2 A1', { big: true, linkedTo: ['ys_p34'] }],
  ['ys_p32', 'ziyafet_salonu', 30, 29, 'G2 A2 R1', { big: true }],
  ['ys_p33', 'ziyafet_salonu', 37.5, 29, 'C1 W3', { big: true }],
  ['ys_p34', 'ziyafet_salonu', 24, 29.5, 'F1 M1', { big: true, linkedTo: ['ys_p31'] }],
  ['ys_p35', 'ziyafet_salonu', 29, 24.5, 'G3 D1', { big: true, patrol: [[17, 24.5], [41, 24.5]] }],
  ['ys_p36', 'ziyafet_salonu', 20, 22, 'D1 R1 G1'],
  ['ys_p37', 'ziyafet_salonu', 38, 23, 'D2 E1'],
  ['ys_p38', 'bati_salonu', 8, 25, 'A2 R1 E1', { optional: true }],
  ['ys_p39', 'bati_salonu', 6, 23, 'C1 S2 W1', { optional: true }],
  ['ys_p40', 'servis_a', 40.5, 37.5, 'G2 M1', { linkedTo: ['ys_p41'], note: 'skip route' }],
  ['ys_p41', 'servis_b', 38.5, 35, 'E1 A1 W2', { linkedTo: ['ys_p40'], note: 'skip route' }],
  ['ys_p42', 'rasathane', 51, 16, 'A1 E1', { optional: true }],
  ['ys_p43', 'kule_merdiveni', 29.5, 17.6, 'G2', { note: 'lower landing row only: the lift cage takes rows 16-17' }],
  ['ys_p44', 'kule_merdiveni', 29.5, 15, 'D1 A1 E1', { note: 'lift arrival aggroes this pack within 12 m' }],
];
const PACKS: PackDef[] = PACK_ROWS.map(([id, roomId, cx, cz, spec, extra]) => pack(id, roomId, cx, cz, undefined, members(spec), extra ?? {}));

// ---------------------------------------------------------------------------------------------------------------------
// Bosses (doc 5). Arenas are flat; the balcony is reached only by the Kule lift.
// ---------------------------------------------------------------------------------------------------------------------
const BOSSES = [
  bossAt('boss_gerdan', 'yaldizli_carsi', 25.5, 43.5, 0, 1),
  bossAt('boss_taliksa', 'gece_mahkemesi', 53, 40, -90, 2),
  bossAt('boss_melandros', 'balkon', 30, 8, 0, 3),
];

// ---------------------------------------------------------------------------------------------------------------------
// Theme (doc 2.3, 2.4). 'dungeon_shadow' is the fallback until 'dungeon_court' is registered in MUSIC_IDS.
// ---------------------------------------------------------------------------------------------------------------------
const THEME: DungeonTheme = {
  fogColor: 0x0c1230, fogNear: 14, fogFar: 64, ambient: 0x3a4aa0, ambientIntensity: 0.42, hemiSky: 0x8a9cff, hemiGround: 0x1a1030,
  torchColor: 0xffc860, bloomStrength: 0.6, music: 'dungeon_shadow', palette: [0x0c1230, 0x4aa8ff, 0xd8dcf0, 0xffc860, 0x58ff70],
  tint: 0xe0e4ff, sky: { image: '/assets/sky/itch/psx-skyboxes-free/night-moon.png', stars: true },
};

// ---------------------------------------------------------------------------------------------------------------------
// Start, exit, Font of Power and the reserved circles (kept clear of scatter)
// ---------------------------------------------------------------------------------------------------------------------
const START: [number, number] = [26.5, 72.8];
const FONT: [number, number] = [26.5, 70.3];
const EXIT: [number, number] = [36.5, 5.5];
const ctx = makeCtx('yildiz_divani', DOORS, PACKS, [
  { x: START[0], z: START[1], r: 2.0 },
  { x: FONT[0], z: FONT[1], r: 1.6 },
  { x: EXIT[0], z: EXIT[1], r: 2.8 },
  { x: 25.5, z: 43.5, r: 4.5 },   // Gerdan
  { x: 53, z: 40, r: 4.5 },       // Taliksa
  { x: 30, z: 8, r: 5.0 },        // Melandros
  { x: 22, z: 4.8, r: 2.2 },      // Gece Pınarı
]);
const D = decorator(ctx, rectsOf(ROOMS));

const GOLD = 0xc89030;
const CYAN = 0x6ac8ff;
const GREEN = 0x58ff70;
const SILVER = 0xd8dcf0;
const INDIGO = 0x2a3a78;
const WARM = 0xffd890;

/** Cyan lantern post (gen/props lamp_post, light on top). */
const lampPost = (p: Props, x: number, z: number): Props => p.at(gp('lamp_post'), x, z, { light: lt(CYAN, 1.2, 9, false, 2.2) });
/** Brazier with a fel (green) or cyan flame. Collides: it sits next to a covenant spot. */
const brazier = (p: Props, x: number, z: number, color: number): Props => p.at(gp('brazier'), x, z, { collide: true, light: lt(color, 2.0, 12, true, 1.0) });
/** Crystal shard with a light. */
const crystal = (p: Props, x: number, z: number, s: number, color: number, purple = false): Props =>
  p.at(gp(purple ? 'crystal_purple' : 'crystal_blue'), x, z, { scale: s, rot: p.rnd(0, 360), emissive: color, light: lt(color, 1.4, 8, false, 0.9 * s) });
const addAll = (p: Props, list: ReturnType<typeof chandelier>): void => {
  for (const c of list) p.list.push(c);
};

// ---- iskele: start quay -------------------------------------------------------------------------------------------
D.room('iskele', (p, r) => {
  p.row(dg('pillar_decorated'), 21, 67.5, 21, 73.5, 3, { tint: 0xd8d8f0 });
  p.row(dg('pillar_decorated'), 32.5, 67.5, 32.5, 73.5, 3, { tint: 0xd8d8f0 });
  [[22, 71.5], [30.5, 71.5], [33, 67.5]].forEach(([x, z]) => lampPost(p, x, z));
  p.row(kg('iron-fence'), 20.5, 74, 33, 74, 6, { tint: SILVER });
  p.at(gp('crystal_blue'), 22.5, 74, { scale: 0.6, light: lt(CYAN, 1.0, 6, true, 0.6) });
  p.torches(r, 'w', [70.5], CYAN).torches(r, 'e', [70.5], CYAN);
  p.wall(r, 'n', [24.5, 29.5], dg('banner_patternB_blue'), { tint: INDIGO });
  p.ring(kg('urn-round'), 21.5, 73.5, 0.9, 2, { tint: GOLD }, 'out');
  p.scatter(3, [dg('barrel_small_stack'), dg('crates_stacked')], Props.inner(r, 1.5), {});
});

// ---- kanallar: Mana Kanalları (canal basin) -----------------------------------------------------------------------
D.room('kanallar', (p) => {
  [[4.5, 61.5], [9.5, 61.5], [4.5, 70.5], [9.5, 70.5]].forEach(([x, z]) => lampPost(p, x, z));
  crystal(p, 5, 66, 0.9, CYAN); crystal(p, 11, 66, 0.9, CYAN);
  p.at(kc('bridge-straight-pillar'), 7.5, 64, { rot: 90 }).at(kc('bridge-straight-pillar'), 11.5, 64, { rot: 90 });
  p.row(gp('rock_medium'), 2.5, 62, 2.5, 72, 4, { scale: 0.9 });
  p.row(kg('iron-fence'), 2.5, 59.5, 13.5, 59.5, 6, { tint: SILVER });
});

// ---- kanal_kemeri / su_kemeri / kemer_avlusu / bahce_yolu: the climb ----------------------------------------------
D.room('kanal_kemeri', (p) => { lampPost(p, 14.5, 69.5); });
D.room('su_kemeri', (p, r) => { p.torches(r, 'w', [55, 58], CYAN); });
D.room('kemer_avlusu', (p) => {
  p.at(kf('fountain-square-detail'), 6.5, 46.5, { id: 'dry_fountain' });
  p.at(gp('crystal_blue'), 6.5, 46.5, { scale: 0.8, y: 0.9 });
});
D.room('bahce_yolu', (p, r) => { p.torches(r, 'w', [63.5], CYAN).torches(r, 'e', [63.5], CYAN); });

// ---- mana_yuvasi: nest chamber --------------------------------------------------------------------------------------
D.room('mana_yuvasi', (p) => {
  crystal(p, 18, 65, 0.7, CYAN);
  p.at(gp('bone_pile'), 16, 66, { rot: 40 });
});

// ---- bahce: Ay Bahçesi (moon fountain, grand stair) ---------------------------------------------------------------------
D.room('bahce', (p, r) => {
  p.at(kf('fountain-round-detail'), 28.5, 56.5, { tint: 0xd8e0ff, collide: true });
  crystal(p, 28.5, 56.5, 0.9, CYAN);
  p.row(kf('hedge-large'), 17.5, 53.5, 17.5, 59.5, 4, {});
  p.row(kf('hedge-large'), 38.5, 53.5, 38.5, 59.5, 4, {});
  p.at(hw('bench_decorated'), 22, 58, { rot: 90 }).at(hw('bench_decorated'), 34, 58, { rot: -90 });
  p.at(gp('statue_hooded'), 23.5, 52.5, { tint: 0xc8d0f0 }).at(gp('statue_hooded'), 32.5, 52.5, { tint: 0xc8d0f0 });
  p.at(gp('tree_oak_a'), 19, 59, { scale: 1.2 }).at(gp('tree_oak_a'), 38, 58.5, { scale: 1.2 });
  p.at(gp('bush_a'), 35, 54, { tint: 0x58825a });
  p.scatter(10, [gp('grass_tuft'), gp('flowers')], Props.inner(r, 1.0), {}, { minDist: 0.9 });
  lampPost(p, 17.5, 55.5); lampPost(p, 17.5, 58.5); lampPost(p, 38.5, 55.5);
  p.torches(r, 'n', [31.5], CYAN);
});

// ---- hizmetci_avlusu: optional service yard ------------------------------------------------------------------------
D.room('hizmetci_avlusu', (p, r) => {
  p.scatter(8, [ip('psx-medieval', 'market/crate'), ip('psx-medieval', 'market/barrel_small')], Props.inner(r, 1.2), {}, { minDist: 1.2 });
  p.at(gp('wagon'), 47, 58, { rot: 30 }).at(gp('well'), 52, 55, { collide: true });
  p.at(kg('altar-stone'), 52.5, 53.5, { collide: true });
  p.torches(r, 'e', [55.5], WARM);
});

// ---- yaldizli_carsi: Gilded Market, B1 Gerdan ----------------------------------------------------------------------
D.room('yaldizli_carsi', (p, r) => {
  p.ring(dg('pillar_decorated'), 26.5, 45, 5.0, 8, { scale: 1.2 }, 'out');
  p.at(gp('statue_hooded'), 19, 40, { tint: 0xc8d0f0, scale: 1.4 }).at(gp('statue_hooded'), 33, 50, { tint: 0xc8d0f0, scale: 1.4 });
  p.row(ip('psx-medieval', 'market/market_stall_blue'), 17, 42, 17, 49, 3, { rot: 90 });
  p.row(ip('psx-medieval', 'market/market_stall_red'), 35.5, 42, 35.5, 49, 3, { rot: -90 });
  p.scatter(6, [ip('psx-medieval', 'market/basket'), ip('psx-medieval', 'market/crate')], Props.inner(r, 1.2), {}, { minDist: 1.2 });
  p.torches(r, 'n', [20, 32], CYAN).torches(r, 's', [20, 32], CYAN);
  p.wall(r, 'w', [44], dg('banner_patternB_blue'), { tint: INDIGO });
  lampPost(p, 25.5, 51.5); lampPost(p, 25.5, 39.5);
});

// ---- fel_gecidi: Zümrüt Geçit (fel corridor) ------------------------------------------------------------------------
// fel_gecidi is a 2-tile corridor between two packs: no floor props (the braziers and cages of doc 2.6 do not fit).

// ---- gece_mahkemesi: Midnight Court, B2 Taliksa ---------------------------------------------------------------------
D.room('gece_mahkemesi', (p) => {
  [[50.5, 38.5], [55.5, 43.5], [50, 46]].forEach(([x, z]) => brazier(p, x, z, GREEN));
  p.at(gp('altar'), 53, 40, { tint: 0x0a2a14, id: 'taliksa_altar' });
  p.at(kf('fountain-round-detail'), 48.5, 41.5, { tint: 0x5a6a5a });
  [[45.5, 37.5], [45.5, 46.5], [57.5, 37.5], [57.5, 46.5], [51, 49.5]].forEach(([x, z]) => crystal(p, x, z, 1.0, GREEN, true));
  p.row(gp('statue_hooded'), 46, 39, 46, 45, 2, { rot: 90, tint: 0x4a4a52 });
  p.at(gp('lamp_post'), 56.5, 37.5, { light: lt(GREEN, 1.0, 8, true, 2.0) });
});

// ---- servis_a / servis_b: skip route -----------------------------------------------------------------------------------
D.room('servis_a', (p, r) => {
  p.scatter(5, [dg('barrel_large'), dg('crates_stacked')], Props.inner(r, 1.0), {}, { minDist: 1.2 });
  p.torches(r, 'n', [41], WARM);
});
D.room('servis_b', (p, r) => {
  p.scatter(4, [dg('barrel_large'), dg('crates_stacked')], Props.inner(r, 1.0), {}, { minDist: 1.4 });
  p.torches(r, 'w', [35.5], WARM);
});

// ---- kuzey_kemeri / ev_girisi: the foyer ------------------------------------------------------------------------------
D.room('kuzey_kemeri', (p, r) => {
  p.torches(r, 'w', [32.5, 34.5], WARM).torches(r, 'e', [32.5, 34.5], WARM);
  p.at(fu('cabinet_medium'), 50.6, 31.5, { rot: 180 });
  p.wall(r, 'e', [33.5], dg('banner_patternC_green'));
});
D.room('ev_girisi', (p, r) => {
  addAll(p, chandelier(46, 30, 12));
  addAll(p, chandelier(56, 27, 12));
  p.at(gp('statue_hooded'), 45.5, 22.5, { tint: WARM }).at(gp('statue_hooded'), 55.5, 29.5, { tint: WARM });
  p.row(dg('pillar_decorated'), 48, 23, 48, 29, 2, { scale: 1.6 });
  p.at(kg('altar-stone'), 58, 29, {});
  p.torches(r, 'n', [46, 54], WARM);
  p.at(fu('rug_rectangle_stripes_A'), 50, 26, { rot: 90 });
  p.wall(r, 'e', [24.5], dg('banner_patternC_green'));
});

// ---- ziyafet_salonu: the ballroom, spy hunt hall --------------------------------------------------------------------
D.room('ziyafet_salonu', (p, r) => {
  [[19, 31], [30, 31], [37.5, 31]].forEach(([x, z]) => addAll(p, chandelier(x, z, 19)));
  addAll(p, chandelier(24, 22, 19));
  addAll(p, chandelier(42, 22, 19));
  p.row(dg('pillar_decorated'), 16, 19.5, 42, 19.5, 6, { scale: 3.0 });
  p.at(dg('table_long_tablecloth_decorated_A'), 22, 26, { rot: 90 });
  p.at(dg('table_long_tablecloth_decorated_A'), 32, 26, { rot: 90 });
  p.wall(r, 'n', [22.5, 30.5, 38.5], dg('banner_patternB_red'), { tint: 0xb03040 });
  p.at(gp('statue_hooded'), 14.5, 25.5, { tint: WARM });
  p.at(gp('statue_hooded'), 43.5, 25.5, { tint: WARM });
  p.at(gp('crystal_purple'), 28.5, 24.5, { scale: 0.5, emissive: GOLD, light: lt(0xffc860, 1.6, 9, true, 0.8), id: 'astrolabe_glow' });
});

// ---- bati_salonu: west library -------------------------------------------------------------------------------------
D.room('bati_salonu', (p, r) => {
  p.at(fu('cabinet_medium'), 5, 22, { rot: 90 }).at(fu('cabinet_medium'), 5, 27, { rot: 90 });
  p.at(fu('table_medium'), 9, 25).at(fu('armchair_pillows'), 7, 22, { rot: 90 });
  p.torches(r, 'n', [7, 11], WARM);
});

// ---- ev_girisi mezzanine / rasathane: observatory --------------------------------------------------------------------
D.room('rasathane', (p) => {
  p.at(gp('crystal_purple'), 49, 14.5, { scale: 0.9, light: lt(0xb8c0ff, 1.4, 10, false, 0.8) }).at(gp('crystal_purple'), 55, 17, { scale: 0.7 });
  p.at(kg('pillar-obelisk'), 47.5, 19, { scale: 1.1 }).at(kg('pillar-obelisk'), 56, 19, { scale: 1.1 });
  p.at(dg('table_long'), 52, 15);
});

// ---- kule_merdiveni: the lift shaft -------------------------------------------------------------------------------
D.room('kule_merdiveni', (p, r) => {
  p.torches(r, 'w', [15.5, 17.5], CYAN).torches(r, 'e', [15.5, 17.5], CYAN);
  p.at(gp('waypoint_stone'), 31, 17.5, { id: 'lift_call' });
  p.wall(r, 'n', [29.5], dg('banner_patternB_blue'), { tint: INDIGO });
});

// ---- balkon: B3 Melandros on the balconies ----------------------------------------------------------------------------
D.room('balkon', (p) => {
  [[23, 2.5], [27, 2.5], [33, 2.5], [37, 2.5]].forEach(([x, z]) => p.at(gp('statue_hooded'), x, z, { tint: 0xc8d0f0 }));
  p.at(gp('crystal_blue'), 22, 4.8, { scale: 2.0, y: 17.25, emissive: 0x9fe0ff, light: lt(0x9fe0ff, 2.6, 16, false, 2.0), id: 'nightwell' });
  p.row(kf('balcony-wall-fence'), 19.5, 13.5, 35.5, 13.5, 6, {});
  p.at(dg('banner_patternB_blue'), 22, 2.5, { tint: INDIGO, y: 5, scale: 1.4 });
  lampPost(p, 33.5, 9.5); lampPost(p, 36.5, 9.5);
});

// ---- kemer_avlusu / mana_yuvasi / rooms with only room-level light: nothing else -------------------------------------

const ZONES: Record<string, ZoneDef[]> = {
  kanallar: [
    rectZone('pool', 2, 63, 12, 2, { blocked: true, color: 0x0a3a6a, glow: 0x4ac0ff, glowIntensity: 0.5 }),
    rectZone('pool', 2, 67, 12, 2, { blocked: true, color: 0x0a3a6a, glow: 0x4ac0ff, glowIntensity: 0.5 }),
    rectZone('bridge', 7, 67, 2, 2), rectZone('bridge', 3, 63, 2, 2), rectZone('bridge', 11, 63, 2, 2),
  ],
  bahce: [circleZone('pool', 28.5, 56.5, 1.8, { blocked: true, color: 0x0a3a6a, glow: 0x6ac8ff, glowIntensity: 0.5 })],
  iskele: [circleZone('rune', 26.5, 72.5, 2.4, { color: 0x141a3a, glow: 0x7fd0ff, glowIntensity: 0.5 })],
  yaldizli_carsi: [circleZone('rune', 25.5, 43.5, 6.0, { color: 0x141a3a, glow: 0x7fb0ff, glowIntensity: 0.5 })],
  gece_mahkemesi: [circleZone('rune', 50.5, 42.5, 7.5, { color: 0x0a2a14, glow: 0x58ff70, glowIntensity: 0.6 })],
  ziyafet_salonu: [circleZone('rune', 28.5, 24.5, 5.5, { color: 0x2a2040, glow: 0xffc860, glowIntensity: 0.7 })],
  balkon: [circleZone('rune', 30, 8, 8, { color: 0x141a3a, glow: 0x9fe0ff, glowIntensity: 0.5 })],
};

// ---------------------------------------------------------------------------------------------------------------------
// Per-room ambience and fog (doc 2.3). Ambience ids are existing sfx ids (P-07).
// ---------------------------------------------------------------------------------------------------------------------
const ROOM_EXTRA: Record<string, Partial<RoomDef>> = {
  iskele: { ambientVfx: 'ambient_dust', lightColor: 0x7fd0ff, fog: { color: 0x101c44, near: 16, far: 70 }, ambience: [{ id: 'water_lap', radius: 14, volume: 0.25, loop: true }] },
  kanal_kemeri: { ambientVfx: 'ambient_dust', lightColor: CYAN },
  kanallar: { ambientVfx: 'ambient_dust', lightColor: 0x4ac0ff, fog: { color: 0x0a2a48, near: 10, far: 50 }, ambience: [{ id: 'water_lap', radius: 18, volume: 0.35, loop: true }] },
  su_kemeri: { ambientVfx: 'ambient_dust', lightColor: CYAN },
  kemer_avlusu: { ambientVfx: 'ambient_embers', lightColor: 0xa8b8ff, fog: { color: 0x101c44, near: 18, far: 80 } },
  mana_yuvasi: { ambientVfx: 'ambient_dust', lightColor: CYAN, ambience: [{ id: 'whisper', radius: 8, volume: 0.2, loop: true }] },
  bahce_yolu: { ambientVfx: 'ambient_embers', lightColor: 0xa8b8ff },
  bahce: { ambientVfx: 'ambient_embers', lightColor: 0xa8b8ff, fog: { color: 0x101c44, near: 18, far: 80 }, ambience: [{ id: 'water_lap', pos: [28.5, 56.5], radius: 8, volume: 0.3, loop: true }] },
  hizmetci_avlusu: { ambientVfx: 'ambient_dust', lightColor: WARM, fog: { color: 0x161c40, near: 14, far: 60 }, ambience: [{ id: 'crowd_murmur', radius: 14, volume: 0.15, loop: true }] },
  yaldizli_carsi: { ambientVfx: 'ambient_dust', lightColor: WARM, fog: { color: 0x14204e, near: 18, far: 80 } },
  fel_gecidi: { ambientVfx: 'ambient_embers', lightColor: GREEN, fog: { color: 0x082414, near: 10, far: 46 }, ambience: [{ id: 'whisper', radius: 10, volume: 0.25, loop: true }] },
  gece_mahkemesi: { ambientVfx: 'ambient_embers', lightColor: GREEN, fog: { color: 0x082414, near: 10, far: 46 } },
  servis_a: { ambientVfx: 'ambient_dust' },
  servis_b: { ambientVfx: 'ambient_dust', lightColor: WARM, ambience: [{ id: 'crowd_murmur', radius: 8, volume: 0.1, loop: true }] },
  kuzey_kemeri: { ambientVfx: 'ambient_dust', lightColor: WARM, ambience: [{ id: 'crowd_murmur', radius: 12, volume: 0.12, loop: true }] },
  ev_girisi: { ambientVfx: 'ambient_dust', lightColor: WARM, fog: { color: 0x1a1430, near: 20, far: 90 } },
  rasathane: { ambientVfx: 'ambient_dust', lightColor: 0xb8c0ff, fog: { color: 0x10183c, near: 20, far: 80 } },
  ziyafet_salonu: { ambientVfx: 'ambient_dust', lightColor: WARM, fog: { color: 0x1a1430, near: 20, far: 90 }, ambience: [{ id: 'crowd_murmur', radius: 22, volume: 0.15, loop: true }] },
  bati_salonu: { ambientVfx: 'ambient_dust', lightColor: WARM, fog: { color: 0x1a1430, near: 20, far: 90 } },
  kule_merdiveni: { ambientVfx: 'ambient_dust', lightColor: CYAN, ambience: [{ id: 'lift_hum', radius: 6, volume: 0.3, loop: true }] },
  balkon: { ambientVfx: 'ambient_dust', lightColor: 0x9fe0ff, fog: { color: 0x0e1a48, near: 24, far: 110 } },
};

// ---------------------------------------------------------------------------------------------------------------------
// Casusu Bul (doc 3.6): spy hunt. The table is derived from the run seed, so every peer computes the same nobles and clues.
// NPCs only talk and ask (ctx.request); the host runs the state machine in attachYildizSpy (one call per run, see the
// DungeonScene hook in the report). Flags: spy_armed, spy_hunting, spy_solved (DungeonDef.events, replicated).
// ---------------------------------------------------------------------------------------------------------------------
const ROBE_COLORS = ['Beyaz', 'Kızıl', 'Mavi', 'Mor'] as const;
const HELD_ITEMS = [
  { label: 'Asa', phrase: 'uzun bir asa' },
  { label: 'Değnek', phrase: 'ince bir değnek' },
  { label: 'Kitap', phrase: 'bir büyü kitabı' },
] as const;
const SPY_ARM_DEADLINE = 300;   // s after Taliksa falls: the hunt is forced to a reveal if nobody starts it
const SPY_HUNT_LIMIT = 150;     // s after the hunt starts without a verdict: Gerenth reveals himself
const SPY_GIVEUP_DELAY = 3;     // s between Layleth's give-up and Gerenth's appearance
const SPY_WRONG_LIMIT = 3;      // wrong accusations before Gerenth reveals himself anyway
const SPY_FORCES = 10;

/** Tile coordinates (doc 3.6): Layleth, rumormongers R1-R6, nobles N1-N8. */
const LAYLETH_POS: [number, number] = [41.5, 25.5];
const RUMOR_POS: [number, number][] = [[29.5, 22.5], [19.5, 23.5], [39.5, 23], [51.5, 27.5], [15.5, 25.5], [12, 28]];
const NOBLE_POS: [number, number][] = [[17.5, 20], [21.5, 19.8], [25.5, 20.2], [33.5, 20], [37.5, 19.8], [41, 21.5], [48.5, 27], [58, 22.5]];

interface SpyLook { robe: number; hat: boolean; held: number }
/** A statement about the spy: `yes` = he has it (robe/held value), or he wears a hat (hat). */
interface SpyStmt { kind: 'robe' | 'hat' | 'held'; value: number; yes: boolean }
interface SpyTable { seed: number; looks: SpyLook[]; spy: number; clues: SpyStmt[]; ambiguous: boolean }

const ALL_LOOKS: SpyLook[] = [];
for (let robe = 0; robe < ROBE_COLORS.length; robe++) {
  for (const hat of [true, false]) for (let held = 0; held < HELD_ITEMS.length; held++) ALL_LOOKS.push({ robe, hat, held });
}
const ALL_STMTS: SpyStmt[] = [];
for (const yes of [true, false]) {
  for (let value = 0; value < ROBE_COLORS.length; value++) ALL_STMTS.push({ kind: 'robe', value, yes });
  for (let value = 0; value < HELD_ITEMS.length; value++) ALL_STMTS.push({ kind: 'held', value, yes });
  ALL_STMTS.push({ kind: 'hat', value: 0, yes });
}

function spySeed(): number {
  return G.mplus?.state?.seed ?? 1;
}

function holds(l: SpyLook, s: SpyStmt): boolean {
  const has = s.kind === 'robe' ? l.robe === s.value : s.kind === 'hat' ? l.hat : l.held === s.value;
  return has === s.yes;
}

function shuffled<T>(items: readonly T[], rng: RNG): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One attempt: 8 distinct looks, greedy true clues (largest cut, at most 4), padded to 5. `ambiguous` when 4 clues do not isolate him. */
function drawSpyTable(seed: number, attempt: number): SpyTable {
  const rng = new RNG(hashString(attempt === 0 ? `${seed}:spy` : `${seed}:spy:${attempt}`));
  const looks = shuffled(ALL_LOOKS, rng).slice(0, NOBLE_POS.length);
  const spy = rng.int(0, looks.length - 1);
  const spyLook = looks[spy];
  let cands = looks.map((_, i) => i);
  const clues: SpyStmt[] = [];
  while (cands.length > 1 && clues.length < 4) {
    let best: SpyStmt | null = null;
    let bestSurv: number[] = [];
    for (const s of shuffled(ALL_STMTS, rng)) {
      if (!holds(spyLook, s)) continue;
      const surv = cands.filter((i) => holds(looks[i], s));
      if (surv.length < cands.length && (best === null || surv.length < bestSurv.length)) {
        best = s;
        bestSurv = surv;
      }
    }
    if (!best) break;
    clues.push(best);
    cands = bestSurv;
  }
  const ambiguous = cands.length !== 1;
  const truths = ALL_STMTS.filter((s) => holds(spyLook, s));
  while (clues.length < 5) {
    const extra = truths.filter((s) => !clues.some((c) => c.kind === s.kind && c.value === s.value && c.yes === s.yes));
    if (extra.length === 0) break;
    clues.push(rng.pick(extra));
  }
  return { seed, looks, spy, clues, ambiguous };
}

const tableCache = new Map<number, SpyTable>();
function spyTable(seed: number): SpyTable {
  const hit = tableCache.get(seed);
  if (hit) return hit;
  let table = drawSpyTable(seed, 0);
  for (let a = 1; table.ambiguous && a < 32; a++) table = drawSpyTable(seed, a);
  if (table.ambiguous) console.warn(`[yildiz] no unique spy within 4 clues for seed ${seed}`);
  tableCache.set(seed, table);
  return table;
}

function clueLine(s: SpyStmt | undefined): string {
  if (!s) return 'Bu dedikodunun gerisi unutulmuş.';
  if (s.kind === 'robe') return s.yes ? `Casus ${ROBE_COLORS[s.value]} bir cüppe giyiyordu.` : `Casus ${ROBE_COLORS[s.value]} cüppe giymez.`;
  if (s.kind === 'hat') return s.yes ? 'Başında bir şapka vardı.' : 'Casus şapka takmaz.';
  const h = HELD_ITEMS[s.value];
  return s.yes ? `Elinde ${h.phrase} vardı.` : `Elinde ${h.phrase} yoktu.`;
}

/** R6 bonus: the spy's robe and hat together (true, but on its own it leaves two candidates). */
function comboLine(t: SpyTable): string {
  const l = t.looks[t.spy];
  return `Casus ${ROBE_COLORS[l.robe]} bir cüppe giyiyordu ${l.hat ? 've başında bir şapka vardı' : 've şapka takmıyordu'}.`;
}

function nobleName(l: SpyLook): string {
  return `Soylu (${ROBE_COLORS[l.robe]} cüppe, ${l.hat ? 'şapkalı' : 'şapkasız'}, ${HELD_ITEMS[l.held].label})`;
}

/** Host-side state of the current run (module-level copy so NPC talks can read the replicated flags). */
let activeSpyStore: DungeonEventStore | null = null;
const spyHunting = (): boolean => activeSpyStore?.get('spy_hunting') === true && activeSpyStore.get('spy_solved') !== true;

type SpyCtx = { request(kind: string, data: Record<string, unknown>): void };

/** Clue lines are derived locally (same seed on every peer), so a rumormonger talk needs no request. */
function rumorTalk(name: string, i: number): void {
  if (!spyHunting()) {
    G.ui.toast('Henüz konuşacak bir şey yok.', 'info');
    return;
  }
  const t = spyTable(spySeed());
  const text = i < 5 ? clueLine(t.clues[i]) : comboLine(t);
  G.ui.toast(`${name}: ${text}`, 'info');
}

const SPY_NPC_CACHE: { seed: number; list: DungeonNpcDef[] } = { seed: NaN, list: [] };
/** Built on each read so the noble names follow the run seed (DungeonScene reads `extras.npcs` at scene build). */
function spyNpcs(): DungeonNpcDef[] {
  const seed = spySeed();
  if (SPY_NPC_CACHE.seed === seed) return SPY_NPC_CACHE.list;
  const t = spyTable(seed);
  const list: DungeonNpcDef[] = [
    {
      id: 'ys_layleth', name: 'Layleth Ayyıldız', model: chr('Mage'), pos: LAYLETH_POS, holdSeconds: 2,
      onInteract: (ctx) => {
        const c = ctx as SpyCtx;
        if (!activeSpyStore?.get('spy_armed')) {
          G.ui.toast('Layleth: Önce Taliksa\'yı durdurun.', 'info');
          return;
        }
        c.request('spy.layleth', {});
      },
    },
    ...RUMOR_POS.map<DungeonNpcDef>((pos, i) => {
      const name = i === 5 ? 'Geveze Dedikoducu (Batı)' : `Geveze Dedikoducu ${i + 1}`;
      return { id: `ys_rumor_${i + 1}`, name, model: npcm('Worker'), pos, onInteract: () => rumorTalk(name, i) };
    }),
    ...NOBLE_POS.map<DungeonNpcDef>((pos, i) => ({
      id: `ys_noble_${i + 1}`, name: nobleName(t.looks[i]), model: chr('Mage'), pos, holdSeconds: 1.5,
      onInteract: (ctx) => {
        if (!spyHunting()) {
          G.ui.toast('Bu soylu sıradan bir misafir gibi görünüyor.', 'info');
          return;
        }
        (ctx as SpyCtx).request('spy.accuse', { index: i });
      },
    })),
  ];
  SPY_NPC_CACHE.seed = seed;
  SPY_NPC_CACHE.list = list;
  return list;
}

export interface YildizSpyHost {
  requestEvent(name: string, on: boolean): void;
  addTicker(fn: (dt: number) => void): () => void;
  readonly dungeonEvents: DungeonEventStore | null;
}

/**
 * Host state machine of the spy hunt (doc 3.6), called once per run by DungeonScene. Returns the disposer.
 * Only the host acts; every peer gets the flags through requestEvent / dungeon_event and the local toasts of the flag listener.
 */
export function attachYildizSpy(scene: YildizSpyHost): () => void {
  const store = scene.dungeonEvents;
  activeSpyStore = store;
  const seed = spySeed();
  const table = spyTable(seed);
  const rng = new RNG(hashString(`${seed}:spy:run`));
  const st = {
    phase: 'idle' as 'idle' | 'armed' | 'hunting' | 'reveal' | 'fight' | 'done',
    t: 0, armedAt: 0, huntAt: 0, revealAt: 0, revealIndex: 0,
    wrong: new Set<number>(), gerenthId: null as number | null, gerenthSpawning: false, disposed: false,
  };
  const level = (): number => G.mplus?.state?.keyLevel || 55;
  const toast = (text: string): void => G.ui.toast(text, 'info');
  const spot = (i: number): { x: number; z: number } => ({ x: (NOBLE_POS[i][0] + 0.5) * TILE_SIZE, z: (NOBLE_POS[i][1] + 0.5) * TILE_SIZE });

  const solve = (): void => {
    if (st.phase === 'done') return;
    st.phase = 'done';
    scene.requestEvent('spy_solved', true);
    G.mplus?.grantForces(SPY_FORCES, 'Casus yakalandı!');
  };

  const spawnGerenth = (i: number): void => {
    st.phase = 'fight';
    const world = G.world;
    if (!world) {
      solve();
      return;
    }
    st.gerenthSpawning = true;
    spawnEnemy(world, 'ys_gerenth', spot(i), { level: level(), aggro: true }).then(
      (e) => {
        st.gerenthSpawning = false;
        if (st.disposed) return;
        if (!e) {
          console.warn('[yildiz] ys_gerenth failed to spawn; the hunt is closed to avoid a soft-lock');
          solve();
          return;
        }
        st.gerenthId = e.id;
      },
      (err: unknown) => {
        st.gerenthSpawning = false;
        console.error('[yildiz] ys_gerenth spawn failed', err);
        solve();
      },
    );
  };

  /** Ends the hunt without a verdict: Gerenth appears at `index` (or a random noble) after `delay` seconds. */
  const beginReveal = (index: number | null, delay: number, text: string): void => {
    st.phase = 'reveal';
    st.revealAt = st.t + delay;
    st.revealIndex = index ?? rng.int(0, NOBLE_POS.length - 1);
    scene.requestEvent('spy_hunting', false);
    toast(text);
  };

  const spawnAdds = (i: number): void => {
    const p = spot(i);
    const world = G.world;
    if (!world) return;
    const adds = ['ys_supheli_asil', 'ys_nobet_muhafizi', 'ys_nobet_muhafizi'];
    adds.forEach((defId, k) => {
      spawnEnemy(world, defId, { x: p.x + 1.5 * (k - 1), z: p.z }, { level: level(), aggro: true }).catch((err: unknown) => {
        console.error(`[yildiz] ${defId} failed to spawn`, err);
      });
    });
  };

  const onLayleth = (): void => {
    if (st.phase === 'armed') {
      st.phase = 'hunting';
      st.huntAt = st.t;
      scene.requestEvent('spy_hunting', true);
    } else if (st.phase === 'hunting') {
      beginReveal(null, SPY_GIVEUP_DELAY, 'Pes ettiniz, casus kendini ele veriyor!');
    }
  };

  const onAccuse = (i: number): void => {
    if (st.phase !== 'hunting' || st.wrong.has(i)) return;
    if (i === table.spy) {
      beginReveal(i, 0, 'Doğru! Casus kendini ele veriyor!');
      return;
    }
    st.wrong.add(i);
    spawnAdds(i);
    toast('Yanlış kişi!');
    if (st.wrong.size >= SPY_WRONG_LIMIT) beginReveal(null, 0, 'Üç yanlış suçlama: casus artık saklanamıyor!');
  };

  const gerenthDown = (): boolean => {
    if (st.gerenthId === null) return false;
    const e = G.world?.get<Enemy>(st.gerenthId);
    return !e || e.isDead || e.removed;
  };

  const offs: (() => void)[] = [];
  offs.push(G.net.onRequest('spy.layleth', () => { if (G.net.isAuthority) onLayleth(); }));
  offs.push(G.net.onRequest('spy.accuse', (d) => {
    if (G.net.isAuthority && typeof d.index === 'number') onAccuse(d.index);
  }));
  offs.push(G.events.on('boss:defeated', (e) => {
    if (e.bossId !== 'boss_taliksa' || !G.net.isAuthority || st.phase !== 'idle') return;
    st.phase = 'armed';
    st.armedAt = st.t;
    scene.requestEvent('spy_armed', true);
  }));
  offs.push(scene.addTicker((dt) => {
    st.t += dt;
    if (!G.net.isAuthority) return;
    if (st.phase === 'armed' && st.t - st.armedAt >= SPY_ARM_DEADLINE) beginReveal(null, 0, 'Casus kendini ele verdi!');
    else if (st.phase === 'hunting' && st.t - st.huntAt >= SPY_HUNT_LIMIT) beginReveal(null, 0, 'Casus kendini ele verdi!');
    else if (st.phase === 'reveal' && st.t >= st.revealAt) spawnGerenth(st.revealIndex);
    else if (st.phase === 'fight' && !st.gerenthSpawning && gerenthDown()) solve();
  }));
  if (store) {
    offs.push(store.on((name, on) => {
      if (!on) return;
      if (name === 'spy_armed') toast('Taliksa düştü. Layleth ile konuşun.');
      else if (name === 'spy_hunting') {
        toast('Casus avı başladı: dedikoduculardan ipucu toplayın.');
        G.player?.statuses.apply('disguise', 600, { sourceId: null });
      } else if (name === 'spy_solved') toast('Casus yakalandı!');
    }));
  }

  return () => {
    st.disposed = true;
    for (const off of offs) off();
    if (activeSpyStore === store) activeSpyStore = null;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Extras, lifts, events, assembly
// ---------------------------------------------------------------------------------------------------------------------
const DROP ={ dmgPctMax: 0.25, eliteCap: 0.15, stun: 3, playerCoef: 3.5, ring: 4.5 };
const BOON = { status: 'ay_cesmesi' as const, duration: 60, magnitude: 0.1, oncePerPlayer: true, persistOnDeath: false };

const EXTRAS: NonNullable<DungeonDef['extras']> = {
  get npcs(): DungeonNpcDef[] {
    return spyNpcs();
  },
  fontOfPower: pt(FONT[0], FONT[1]),
  shrines: [
    { type: 'shrine_power', pos: pt(22.5, 59.5) },
    { type: 'shrine_haste', pos: pt(52.5, 53.5) },
    { type: 'shrine_ward', pos: pt(58, 29) },
  ],
  riftSpots: ([[31, 53], [8, 46.5], [9, 71], [51.5, 27.5], [21, 26.5], [47, 58.5]] as [number, number][]).map(([x, z]) => pt(x, z)),
  chests: [
    { pos: pt(6.5, 28.5), kind: 'chest_wood' },
    { pos: pt(52.8, 56.5), kind: 'chest_gold' },
    { pos: pt(18.5, 62.5), kind: 'chest_iron' },
  ],
  dropProps: [
    { id: 'kandil_1', pos: pt(24, 29.5), winch: pt(24, 31), ...DROP },
    { id: 'kandil_2', pos: pt(30, 29), winch: pt(30, 31), ...DROP },
    { id: 'kandil_3', pos: pt(37.5, 29), winch: pt(37.5, 31), ...DROP },
    { id: 'kandil_4', pos: pt(46.5, 25.5), winch: pt(45, 27), ...DROP },
  ],
  boons: [
    { id: 'cesme_bahce', pos: pt(31, 56.5), ...BOON },
    { id: 'cesme_carsi', pos: pt(16, 49.5), ...BOON },
    { id: 'cesme_foyer', pos: pt(45, 29.5), ...BOON },
    { id: 'cesme_salon', pos: pt(42, 30.5), ...BOON },
  ],
};

const rooms: RoomDef[] = withProps(
  ROOMS.map((r) => {
    const merged: RoomDef = { ...r, ...ROOM_EXTRA[r.id] };
    if (SLOPES[r.id]) merged.slopes = SLOPES[r.id];
    if (HEIGHTS[r.id]) merged.heightAreas = HEIGHTS[r.id];
    if (TIERS[r.id]) merged.tiers = TIERS[r.id];
    if (ZONES[r.id]) merged.zones = ZONES[r.id];
    return merged;
  }),
  D.out,
);

export const YILDIZ_DIVANI: DungeonDef = {
  id: 'yildiz_divani',
  name: 'Yıldız Divanı',
  shortName: 'Divan',
  lore: "Kadim Diyar'ın en yüksek terasında Gecedoğan soyluları, Gece Pınarı'nın gücüyle zamanı durdurdu ve o gece bir daha bitmeyen bir balo başladı. Şimdi Zümrüt Alev Ordusu davetsiz bir konuk olarak konağın kapılarında. Devriye Kaptanı Gerdan kapıları tutuyor, Taliksa Alevçelenk Gece Mahkemesi'ni ele geçirdi, Danışman Melandros ise Müneccim'in sırrını düşmana satmaya hazırlanıyor. Maskeni tak, casusu bul ve Pınar'ı kurtar.",
  levelRange: [55, 60],
  timerSec: 1800,
  forcesRequired: 450,
  season: 1,
  endgame: true,
  theme: THEME,
  grid: { w: 62, h: 77 },
  vertical: true,
  rooms,
  doors: DOORS,
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 180 },
  exit: { pos: shPt(EXIT[0], EXIT[1]) },
  extras: EXTRAS,
  events: { spy_armed: false, spy_hunting: false, spy_solved: false, servis_kilidi: false, nightwell_poisoned: false },
  lifts: [lift('kule_lift', 'kule_merdiveni', { x: 29, z: 16, w: 2, h: 2 }, [7.2, 16.8], { speed: 1.6, mode: 'call', start: 0 })],
};
