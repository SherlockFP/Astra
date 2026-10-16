import type { TownNpc } from '../../types/dungeons';
import type { AmbientDef, AmbientRoute, AmbientStop } from '../../types/ambient';

/**
 * AYAZ DAGLARI ambient life (WorldExtras.ambient, GDD_OPENWORLD ambient pass): caravans and guards on the mountain roads between the
 * three outposts (Kartal Geçidi, Kırağı Konağı, Buz Kulesi), snow hares and ravens, a small goat-and-deer herd in the valley, the
 * village cues. OWNER: content module. Same schema and runtime as Sisli Vadi and Karakır (scenes/world/AmbientLife.ts).
 *
 * Points are tile coordinates (1 tile = 4 m, the centre of the tile), converted by `pt`. The walker legs and the critter patches keep to
 * the roads and open snow that the enemy camp rings (+12 m) leave free; the ambient checks run on the flooded nav of this zone.
 */

/** Tile index -> world metres (the centre of a 4 m tile). */
const m = (t: number): number => t * 4 + 2;
/** A tile point as world metres. */
const pt = (tx: number, tz: number): [number, number] => [m(tx), m(tz)];
/** A point `dx`, `dz` metres from a village centre (tile point). */
const at = (tile: [number, number], dx: number, dz: number): [number, number] => {
  const [x, z] = pt(tile[0], tile[1]);
  return [x + dx, z + dz];
};

/** The outposts (tile centres, ayaz_villages.ts). */
const GECIT: [number, number] = [30, 200];
const KIRAGI: [number, number] = [190, 110];
const BUZ: [number, number] = [320, 230];

/** A closed walking routine over these stops (world metres); `dwell` by stop index. */
function walk(stops: [number, number][], speed: number, extra: Partial<AmbientRoute> = {}, dwell?: Record<number, { dwell: number; clip?: string }>): AmbientRoute {
  const out: AmbientStop[] = stops.map((p, i) => ({ pos: p, ...(dwell?.[i] ?? {}) }));
  return { stops: out, speed, ...extra };
}

/** Walker NPC: a routine NPC of the open world (role citizen or guard: no panel, no quest; `lines` = flavour, the first is the greeting). */
function npc(id: string, name: string, role: TownNpc['role'], model: string, route: AmbientRoute, extra: Partial<TownNpc> = {}): TownNpc {
  const [x, z] = route.stops[0].pos;
  return { id, name, role, model, pos: [x, 0, z], routine: route, ...extra };
}

const GUARD_SHOW = ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'];
const WAGON = '/assets/models/kenney/fantasy-town-kit/cart.glb';

const WALKERS: TownNpc[] = [
  // the Geçit road below the Kartal Geçidi village: two guards on lanes 2.4 m apart
  npc('amb_a_gecit_muhafiz_1', 'Geçit Devriyesi', 'guard', 'Knight', walk([pt(12, 199.4), pt(20, 199.4)], 1.4, {}, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x7090b0, show: GUARD_SHOW, lines: ['Geçit kapanmadan geçin, dağda hava bir anda döner.'],
  }),
  npc('amb_a_gecit_muhafiz_2', 'Geçit Devriyesi', 'guard', 'Knight', walk([pt(12, 200.6), pt(20, 200.6)], 1.4, { phase: 24 }, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x7090b0, show: GUARD_SHOW, lines: ['Kurtlar buzun üstünden iniyormuş.'],
  }),
  // the caravan road from the pass to Kırağı Konağı, with a merchant and his cart
  npc('amb_a_kervanci', 'Kervancı Sarp', 'citizen', 'Rogue_Hooded', walk([pt(56, 182), pt(88, 166)], 1.0, { cart: WAGON, walk: 'Walking_B' }, { 1: { dwell: 6, clip: 'Idle' } }), {
    tint: 0x506a80, lines: ['Kırağı Konağı\'na kadar ısınmak yok, yorgana sarılın.', 'Buz Kulesi yolu bu hafta kapalıymış.'],
  }),
  // a wanderer on the Rüzgâr road east of the Kırağı lake
  npc('amb_a_yolcu', 'Gezgin Nazlı', 'citizen', 'Rogue', walk([pt(318, 88), pt(332, 72)], 1.3, { phase: 30, walk: 'Walking_C' }, { 1: { dwell: 4, clip: 'Idle' } }), {
    tint: 0x8090a0, lines: ['Rüzgâr sırtında bayrağımı kaybettim, yolda gördünüz mü?'],
  }),
  // Buz Kulesi: a guard pair on the approach road from the north-west
  npc('amb_a_buz_muhafiz', 'Buz Kulesi Nöbetçisi', 'guard', 'Knight', walk([pt(302, 186), pt(310, 212)], 1.4, { phase: 8 }, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x6a7c98, show: GUARD_SHOW, lines: ['Zemheri\'nin sesi bu gece geldi, pencereleri kapatın.'],
  }),
];

export const AYAZ_AMBIENT_NPCS: TownNpc[] = WALKERS;

// ---------------------------------------------------------------------------------------------------------------------------------
// Critters (cosmetic): zones by kind, centres in world metres, radius in metres, count per zone
// ---------------------------------------------------------------------------------------------------------------------------------

const CRITTERS = [
  // snow hares on the slopes below the pass and the valley
  { id: 'a_tavsan_gecit', kind: 'rabbit', center: pt(40, 220), radius: 22, count: 5 },
  { id: 'a_tavsan_kiragi', kind: 'rabbit', center: pt(44, 176), radius: 12, count: 4 },
  // ravens: on the watch towers and the rocks by each outpost; they take off when the player comes close
  { id: 'a_kus_gecit', kind: 'bird', center: pt(44, 186), radius: 12, count: 4 },
  { id: 'a_kus_buz', kind: 'bird', center: pt(312, 246), radius: 12, count: 4 },
  { id: 'a_kus_zirve', kind: 'bird', center: pt(330, 300), radius: 12, count: 4 },
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Deer herds (neutral) on the valley meadow, away from the enemy camp rings
// ---------------------------------------------------------------------------------------------------------------------------------

const HERDS = [
  { id: 'a_geyik_vadi', center: pt(56, 210), radius: 10, count: 2 },
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Ambient cues: chimney smoke, lit windows and the gate torches
// ---------------------------------------------------------------------------------------------------------------------------------

const SMOKE = [
  ...[[-18, -12], [18, -12], [-6, 14]].map(([dx, dz]) => ({ pos: at(GECIT, dx, dz), y: 8 })),
  ...[[-14, -6], [14, 6]].map(([dx, dz]) => ({ pos: at(KIRAGI, dx, dz), y: 8 })),
  ...[[-16, -8], [16, 6]].map(([dx, dz]) => ({ pos: at(BUZ, dx, dz), y: 9 })),
];

const GLOWS = [
  ...[[-18, -12], [18, -12], [-6, 14]].map(([dx, dz]) => ({ pos: at(GECIT, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  ...[[-14, -6], [14, 6]].map(([dx, dz]) => ({ pos: at(KIRAGI, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  ...[[-16, -8], [16, 6]].map(([dx, dz]) => ({ pos: at(BUZ, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  // torches on the Buz Kulesi gate towers
  ...[[-12, -24], [12, -24]].map(([dx, dz]) => ({ pos: at(BUZ, dx, dz), y: 9, kind: 'torch' as const })),
];

/**
 * The Ayaz Dağları ambient set. The runtime streams it by chunk (scenes/world/AmbientLife.ts); the checks are the sim's placement rules.
 */
export const AYAZ_AMBIENT: AmbientDef = {
  npcs: WALKERS,
  critters: CRITTERS.map((c) => ({ id: c.id, kind: c.kind, center: c.center as [number, number], radius: c.radius, count: c.count })),
  herds: HERDS.map((h) => ({ id: h.id, center: h.center as [number, number], radius: h.radius, count: h.count })),
  smoke: SMOKE,
  glows: GLOWS,
  maxCritters: 60,
};
