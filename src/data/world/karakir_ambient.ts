import type { TownNpc } from '../../types/dungeons';
import type { AmbientDef, AmbientRoute, AmbientStop } from '../../types/ambient';

/**
 * KARAKIR BOZKIRI ambient life (WorldExtras.ambient, GDD_OPENWORLD ambient pass): travellers and guards on the roads between the three
 * outposts, steppe critters per region theme, a deer herd on the golden grass and the plateau, lake frogs, the village cues. OWNER: content
 * module. Same schema and runtime as Sisli Vadi (sisli_ambient.ts, scenes/world/AmbientLife.ts); everything is local to each peer.
 *
 * Points are tile coordinates (1 tile = 4 m, the centre of the tile) and are converted by `pt` / `m`. Walker legs stay on the roads and
 * the open steppe that the enemy camp rings (+12 m) leave free (the camp list is karakir_world.ts CAMP_SPECS; the ambient sim checks every
 * stop and leg on the flooded nav). Outposts are friendly: the walkers keep to their roads outside the palisades.
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

/** The outposts (tile centres, karakir_villages.ts). */
const KAROL: [number, number] = [45, 159];
const KERVAN: [number, number] = [174, 192];
const KUL: [number, number] = [348, 210];

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
  // the east road of Karakır Karakolu: two guards on lanes 2.4 m apart (on one lane they would pass head-on, and their plates would overlap)
  npc('amb_k7_muhafiz_1', 'Karakol Devriyesi', 'guard', 'Knight', walk([pt(20, 156.6), pt(28, 156.6)], 1.4, {}, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x9a7a50, show: GUARD_SHOW, lines: ['Otlaklarda kurt izi var, gözünüz açık olsun.', 'Kervanlar geçene kadar yolu tutuyoruz.'],
  }),
  npc('amb_k7_muhafiz_2', 'Karakol Devriyesi', 'guard', 'Knight', walk([pt(20, 157.4), pt(28, 157.4)], 1.4, { phase: 24 }, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x9a7a50, show: GUARD_SHOW, lines: ['Hava kararmadan Karakol\'a varın.'],
  }),
  // the caravan road from the fort to Kervansaray: a merchant with his cart (the road between the two camp rings)
  npc('amb_k7_kervanci', 'Kervancı Hüseyin', 'citizen', 'Rogue_Hooded', walk([pt(62, 161), pt(110, 179)], 1.1, { cart: WAGON, walk: 'Walking_B' }, { 1: { dwell: 6, clip: 'Idle' } }), {
    tint: 0x7a6040, lines: ['Kervan yolda, bozkırın tozu bizi örtüyor.', 'Kervansaray\'da bir bardak ayran iyi gelir.', 'Haydutlar yine Kızıl Çorak\'a çekildi.'],
  }),
  // a shepherd walks the Otlak road between the fort and the Otlak stone, a rest at each end
  npc('amb_k7_coban', 'Çoban Yusuf', 'citizen', 'Worker', walk([pt(44, 152), pt(42, 140)], 1.0, { phase: 12 }, { 0: { dwell: 5, clip: 'Interact' }, 1: { dwell: 5, clip: 'Interact' } }), {
    tint: 0x908060, lines: ['Koyunlarımı Kurt Çayırı\'na sürmeyeyim dedim, Çayır bu yıl acıktı.'],
  }),
  // a traveller on foot on the Yayla road north of Kervansaray (clear of the Çorak Vahası ring)
  npc('amb_k8_yolcu', 'Gezgin Ozan', 'citizen', 'Rogue', walk([pt(171, 152), pt(164, 124)], 1.3, { phase: 30, walk: 'Walking_C' }, { 1: { dwell: 4, clip: 'Idle' } }), {
    tint: 0x6a6a80, lines: ['Yayla\'ya çıkıyorum, rüzgâr orada bıçak gibi keser.'],
  }),
  // Kül Ocağı: the ash outpost's guard walks the road from the west gate (outside the palisade)
  npc('amb_k11_muhafiz', 'Kül Nöbetçisi', 'guard', 'Knight', walk([pt(318, 211), pt(330, 211)], 1.4, { phase: 6 }, { 0: { dwell: 5, clip: 'Blocking' }, 1: { dwell: 5, clip: 'Blocking' } }), {
    tint: 0x706a60, show: GUARD_SHOW, lines: ['Küllerin altında hâlâ sıcak taş var, dikkatli yürüyün.'],
  }),
];

export const KARAKIR_AMBIENT_NPCS: TownNpc[] = WALKERS;

// ---------------------------------------------------------------------------------------------------------------------------------
// Critters (cosmetic): zones by kind, centres in world metres, radius in metres, count per zone
// ---------------------------------------------------------------------------------------------------------------------------------

const CRITTERS = [
  // rabbits in the golden grass (r7) and on the Kervan road meadow
  { id: 'k_tavsan_otlak', kind: 'rabbit', center: pt(30, 138), radius: 26, count: 6 },
  { id: 'k_tavsan_kervan', kind: 'rabbit', center: pt(120, 154), radius: 22, count: 5 },
  // birds: on the fence posts and the roofs outside each outpost, and on the plateau rocks; they take off when the player comes close
  { id: 'k_kus_karakol', kind: 'bird', center: pt(28, 168), radius: 14, count: 4 },
  { id: 'k_kus_kervansaray', kind: 'bird', center: pt(182, 206), radius: 12, count: 4 },
  { id: 'k_kus_kul', kind: 'bird', center: pt(346, 226), radius: 12, count: 4 },
  { id: 'k_kus_yayla', kind: 'bird', center: pt(120, 70), radius: 12, count: 4 },
  // butterflies over the steppe flowers (r7) and the lake meadow
  { id: 'k_kelebek_otlak', kind: 'butterfly', center: pt(42, 100), radius: 16, count: 8 },
  // frogs on the two lake shores (5 m band outside the water)
  { id: 'k_kurbaga_kara_bati', kind: 'frog', center: [306, 580], radius: 12, count: 5 },
  { id: 'k_kurbaga_kara_guney', kind: 'frog', center: [330, 614], radius: 10, count: 4 },
  { id: 'k_kurbaga_donuk', kind: 'frog', center: [1092, 498], radius: 10, count: 5 },
  // chickens in the fort yard
  { id: 'k_tavuk_karakol', kind: 'chicken', center: at(KAROL, 12, 9), radius: 6, count: 4 },
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Deer herds (neutral) grazing in the open meadows, away from the enemy camp rings
// ---------------------------------------------------------------------------------------------------------------------------------

const HERDS = [
  { id: 'k_geyik_otlak', center: pt(45, 108), radius: 14, count: 2 },
  { id: 'k_geyik_orta', center: pt(104, 140), radius: 12, count: 2 },
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Ambient cues: chimney smoke, lit windows and the fort torches
// ---------------------------------------------------------------------------------------------------------------------------------

const SMOKE = [
  ...[[-24, -15], [24, -15], [-20, -4], [20, -4]].map(([dx, dz]) => ({ pos: at(KAROL, dx, dz), y: 8 })),
  ...[[-8, -4], [8, 4]].map(([dx, dz]) => ({ pos: at(KERVAN, dx, dz), y: 7 })),
  ...[[-10, -6], [10, 6]].map(([dx, dz]) => ({ pos: at(KUL, dx, dz), y: 8 })),
];

const GLOWS = [
  ...[[-24, -15], [24, -15], [-20, -4], [20, -4]].map(([dx, dz]) => ({ pos: at(KAROL, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  ...[[-8, -4], [8, 4]].map(([dx, dz]) => ({ pos: at(KERVAN, dx + 0.4, dz + 0.4), y: 3, kind: 'window' as const })),
  ...[[-10, -6], [10, 6]].map(([dx, dz]) => ({ pos: at(KUL, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  // torches on the fort gates
  ...[[-30, 0], [30, 0], [0, 24]].map(([dx, dz]) => ({ pos: at(KAROL, dx, dz), y: 6, kind: 'torch' as const })),
];

/**
 * The Karakır Bozkırı ambient set. Walker stops and herd / zone centres are checked by dev/combat-sim/ambient.mjs on the Sisli map only;
 * the Karakır set is checked the same way by its own run (see the commit notes). The runtime streams them by chunk (AmbientLife.ts).
 */
export const KARAKIR_AMBIENT: AmbientDef = {
  npcs: WALKERS,
  critters: CRITTERS.map((c) => ({ id: c.id, kind: c.kind, center: c.center as [number, number], radius: c.radius, count: c.count })),
  herds: HERDS.map((h) => ({ id: h.id, center: h.center as [number, number], radius: h.radius, count: h.count })),
  smoke: SMOKE,
  glows: GLOWS,
  maxCritters: 80,
};
