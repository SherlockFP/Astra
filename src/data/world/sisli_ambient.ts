import type { TownNpc } from '../../types/dungeons';
import { TILE_SIZE } from '../../types/dungeons';
import type { AmbientDef, AmbientRoute, AmbientStop } from '../../types/ambient';
import { LAYOUT } from './layout';

/**
 * SISLI VADI ambient life (WorldExtras.ambient): walkers on routines, cosmetic critters, deer herds and ambient cues. OWNER: content
 * module. The layout JSON is the source of truth for the villages and roads. Points are written as village offsets (metres from the
 * village centre, as the layout writes them) or as absolute world metres; the helpers below do the conversion.
 * dev/combat-sim/ambient.mjs checks every walker stop and every walk leg on the flooded nav (walkable, reachable from the zone start,
 * outside every enemy camp ring + 12 m), every critter and herd patch, and every cue.
 *
 * Enemy camps are dense on this map (1,119 rings), so the walkers keep to the stretches of road and the settlements that the rings
 * leave free (found with the sim's camp rings): the village's south road, the bridge road, the Kızılkaya north road. Settlements
 * (koy_* and kamp_*) are friendly and are the point of the layer.
 */

/** Tile units -> world metres (a tile centre). */
const tw = (t: number): number => (t + 0.5) * TILE_SIZE;

/** Settlement centre (world metres) from the layout. */
const CENTRE = new Map(LAYOUT.settlements.map((s) => [s.id, [tw(s.center[0]), tw(s.center[1])] as [number, number]]));
const centreOf = (id: string): [number, number] => {
  const c = CENTRE.get(id);
  if (!c) throw new Error(`sisli_ambient: no settlement ${id}`);
  return c;
};
/** A point `dx`, `dz` metres from a settlement centre (world metres). */
const at = (id: string, dx: number, dz: number): [number, number] => {
  const [x, z] = centreOf(id);
  return [x + dx, z + dz];
};

/** A closed walking routine over these stops (world metres); `dwell` by stop index. */
function walk(stops: [number, number][], speed: number, extra: Partial<AmbientRoute> = {}, dwell?: Record<number, { dwell: number; clip?: string }>): AmbientRoute {
  const out: AmbientStop[] = stops.map((pos, i) => ({ pos, ...(dwell?.[i] ?? {}) }));
  return { stops: out, speed, ...extra };
}

/** Walker NPC: a routine NPC of the open world (role citizen or guard: no panel, no quest; `lines` = flavour, the first is the greeting). */
function npc(id: string, name: string, role: TownNpc['role'], model: string, route: AmbientRoute, extra: Partial<TownNpc> = {}): TownNpc {
  const [x, z] = route.stops[0].pos;
  return { id, name, role, model, pos: [x, 0, z], routine: route, ...extra };
}

const GUM = 'koy_gumusdere';
const KIZ = 'koy_kizilkaya';
const ORTA = 'kamp_orta_karakol';
const CIFTLIK = 'kamp_ciftlik';
const GUM_WELL = at(GUM, 0, 0);

/** Points on a circle of radius `r` round `c` (a closed loop of `n` stops). */
const ringAround = (c: [number, number], r: number, n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r] as [number, number];
  });

const GUARD_SHOW = ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'];

const WALKERS: TownNpc[] = [
  // Gümüşdere villagers: Ayşe's market loop 9 m either side of the well (outside the children's 5.5 m ring), Hasan's lane along the north
  // side (z = +14, clear of both); a short rest at the ends
  npc('amb_g_koylu_ayse', 'Köylü Ayşe', 'citizen', 'Rogue', walk([at(GUM, 9, -13), at(GUM, 9, 10), at(GUM, -9, 10), at(GUM, -9, -13)], 1.3, {}, { 0: { dwell: 3 }, 2: { dwell: 2 } }), {
    tint: 0xa08060, lines: ['Bugün pazar günü, sepetim doldu bile.', 'Kurtlar yine tarlalara yaklaşmış, dikkat et.', 'Kuyu suyu bu yıl tatlı oldu.'],
  }),
  npc('amb_g_koylu_hasan', 'Köylü Hasan', 'citizen', 'Barbarian', walk([at(GUM, -18, 14), at(GUM, 12, 14)], 1.2, { phase: 14 }, { 0: { dwell: 4, clip: 'Idle' }, 1: { dwell: 3, clip: 'Cheer' } }), {
    tint: 0x80a060, lines: ['Odun getirmem lazım, kış yaklaşıyor.', 'Hanın önü kalabalık bu akşam.'],
  }),
  // two children run round the well
  npc('amb_g_cocuk_1', 'Köylü Çocuk', 'citizen', 'Worker', walk(ringAround(GUM_WELL, 5.5, 8), 3.4, { walk: 'Running_A' }), { scale: 0.8, lines: ['Yakala beni, yakala!', 'Kuyuya düşmeden döneceğim!'] }),
  npc('amb_g_cocuk_2', 'Köylü Çocuk', 'citizen', 'Worker', walk(ringAround(GUM_WELL, 5.5, 8), 3.4, { walk: 'Running_A', phase: 4 }), { scale: 0.8, lines: ['Babam bizi bekliyor olacak.', 'Tebeşirle oynuyoruz burada!'] }),
  // the south road guards: from the village's south gate down the road to the outpost (a camp-free stretch of road). They walk two lanes
  // 2.2 m apart: on one lane they would pass head-on, and their name plates would overlap
  npc('amb_g_yol_muhafiz_1', 'Yol Muhafızı', 'guard', 'Knight', walk([at(GUM, 0, 34), at(GUM, 0, 64)], 1.4, {}, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x8090b0, show: GUARD_SHOW, lines: ['Yolculara kötü bakmayın, yol güvende.', 'Gözlerimiz üstünüzde.'],
  }),
  npc('amb_g_yol_muhafiz_2', 'Yol Muhafızı', 'guard', 'Knight', walk([at(GUM, 2.2, 34), at(GUM, 2.2, 64)], 1.4, { phase: 24 }, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0x8090b0, show: GUARD_SHOW, lines: ['Kurt sürüsü gece yaklaştı dediler.'],
  }),
  // Orta Karakol: the courier runs messages between the gate and the tents, inside the palisade
  npc('amb_o_haberci', 'Haberci Emre', 'citizen', 'Rogue', walk([at(ORTA, 2, -2), at(ORTA, -8, 0)], 1.6, { walk: 'Running_A' }, { 0: { dwell: 3 }, 1: { dwell: 2 } }), {
    tint: 0x6a8040, lines: ['Gırtlak\'ın adamları tepeye bakıyormuş.', 'Yaralılara mektup taşıyorum.'],
  }),
  // a water carrier inside Orta Karakol, along the south side of the tent row (clear of the courier's lane)
  npc('amb_o_su_tasiyici', 'Su Taşıyıcı Derya', 'citizen', 'Worker', walk([at(ORTA, 3, -6), at(ORTA, -5, -6)], 1.2, {}, { 0: { dwell: 5, clip: 'Interact' } }), {
    scale: 1.0, lines: ['Su kabı ağır, ama yaralılar bekliyor.'],
  }),
  // the Altın Ambar farmer walks his row between the wheat and the corn, a rest at each end
  npc('amb_c_ciftci_ahmet', 'Çiftçi Ahmet', 'citizen', 'Worker', walk([at(CIFTLIK, -2, -2), at(CIFTLIK, 3, -9)], 1.0, {}, { 0: { dwell: 5, clip: 'Interact' }, 1: { dwell: 5, clip: 'Interact' } }), {
    lines: ['Bu yıl buğday iyi çıktı, Rıza sevinecek.', 'Tarlaya kurt girmesin diye sabah akşam bakıyorum.'],
  }),
  // Kızılkaya forge: an apprentice at the anvil (one stop, the chop clip loops); the smith's own chop is the preset
  npc('amb_k_cirak', 'Demirci Çırağı', 'citizen', 'Barbarian', walk([at(KIZ, -17, 1)], 0, { walk: 'Walking_A' }, { 0: { dwell: 1e6, clip: '1H_Melee_Attack_Chop' } }), {
    tint: 0x907050, lines: ['Usta körükten başını kaldırmaz, ben de örsü döverim.', 'Demir sıcakken dövülür!'],
  }),
  // the Kızılkaya north road: the two guards walk from the north gate out along the road and back, on lanes 2.2 m apart
  npc('amb_k_yol_muhafiz_1', 'Karakol Devriyesi', 'guard', 'Knight', walk([at(KIZ, 0, -36), at(KIZ, 0, 36)], 1.4, {}, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0xa04040, show: GUARD_SHOW, lines: ['Kuzeyden gelen kervanlar hep geç kalır.'],
  }),
  npc('amb_k_yol_muhafiz_2', 'Karakol Devriyesi', 'guard', 'Knight', walk([at(KIZ, 2.2, -36), at(KIZ, 2.2, 36)], 1.4, { phase: 26 }, { 0: { dwell: 4, clip: 'Blocking' }, 1: { dwell: 4, clip: 'Blocking' } }), {
    tint: 0xa04040, show: GUARD_SHOW, lines: ['Kapıyı kapatın, akşam çöküyor.'],
  }),
  // the main road over the bridge: a merchant with his cart on the road, and a traveller on foot on the far side (2.5 m off his line: on
  // one line they would meet head-on at the bridge)
  npc('amb_t_kervanci', 'Gezgin Tüccar Kasım', 'citizen', 'Rogue_Hooded', walk([[1026, 282], [1130, 282]], 1.1, { cart: '/assets/models/kenney/fantasy-town-kit/cart.glb', walk: 'Walking_B' }, { 1: { dwell: 6, clip: 'Idle' } }), {
    tint: 0x406080, lines: ['Kervan yolda, kılıçlar sağlam!', 'Köprüden geçmek bu yıl pahalı oldu.', 'Bir bardak su alabilir miyim?'],
  }),
  npc('amb_t_yaya', 'Yolcu Hasret', 'citizen', 'Rogue', walk([[1130, 284.5], [1026, 284.5]], 1.3, { phase: 40, walk: 'Walking_C' }, { 1: { dwell: 4, clip: 'Idle' } }), {
    tint: 0x7a6a50, lines: ['Ayaklarım yorgun, ama Kızılkaya\'ya varacağım.'],
  }),
];

export const SISLI_AMBIENT_NPCS: TownNpc[] = WALKERS;

// ---------------------------------------------------------------------------------------------------------------------------------
// Critters (cosmetic): zones by kind, centres in world metres, radius in metres, count per zone
// ---------------------------------------------------------------------------------------------------------------------------------

const CRITTERS = [
  // rabbits by the field edges and forest clearings
  { id: 'tavsan_gumus_bati', kind: 'rabbit', center: at(GUM, -62, 22), radius: 30, count: 6 },
  { id: 'tavsan_altin_dogu', kind: 'rabbit', center: [1322, 170], radius: 32, count: 8 },
  { id: 'tavsan_haydut', kind: 'rabbit', center: [1200, 700], radius: 34, count: 6 },
  { id: 'tavsan_son_ocak', kind: 'rabbit', center: [302, 940], radius: 28, count: 5 },
  // birds: perched on the fields and the rooftops, they take off when the player comes close
  { id: 'kus_ciftlik', kind: 'bird', center: at(CIFTLIK, -10, -16), radius: 18, count: 5 },
  { id: 'kus_orman', kind: 'bird', center: [600, 200], radius: 38, count: 6 },
  { id: 'kus_bataklik', kind: 'bird', center: [840, 1380], radius: 36, count: 5 },
  // butterflies: over the well flowers (the village flower beds) and the flower meadows. The Altın meadow sits in the camp rings of the
  // Altın camps (3 camp-free homes in its 26 m, with the orbit): its patch is moved west to open ground (1200, 172), 492 orbit cells fit
  { id: 'kelebek_gumus', kind: 'butterfly', center: GUM_WELL, radius: 22, count: 10 },
  { id: 'kelebek_altin', kind: 'butterfly', center: [1200, 172], radius: 30, count: 12 },
  { id: 'kelebek_koru', kind: 'butterfly', center: [480, 210], radius: 40, count: 10 },
  // frogs on the shore (5 m band outside the water): the silver river's banks and the west river (the lake shore is nav-blocked)
  { id: 'kurbaga_nehir_kuzey', kind: 'frog', center: [1072, 70], radius: 12, count: 5 },
  { id: 'kurbaga_nehir_bati_2', kind: 'frog', center: [1072, 232], radius: 12, count: 5 },
  { id: 'kurbaga_nehir_bati', kind: 'frog', center: [1072, 150], radius: 12, count: 5 },
  { id: 'kurbaga_nehir_ortan', kind: 'frog', center: [1072, 370], radius: 12, count: 5 },
  { id: 'kurbaga_bati_nehri', kind: 'frog', center: [600, 452], radius: 14, count: 5 },
  // chickens round the two farms
  { id: 'tavuk_ciftlik', kind: 'chicken', center: at(CIFTLIK, -3, 0), radius: 9, count: 6 },
  { id: 'tavuk_gumus', kind: 'chicken', center: at(GUM, 33, 18), radius: 7, count: 4 },
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Deer herds (neutral) grazing in the safe meadows, away from the enemy camp rings
// ---------------------------------------------------------------------------------------------------------------------------------

const HERDS = [
  { id: 'geyik_altin', center: [1299, 183], radius: 12, count: 3 },
  { id: 'geyik_koru', center: [420, 150], radius: 14, count: 3 },
  { id: 'geyik_haydut', center: [1278, 581], radius: 14, count: 3 },
] as const;

// ---------------------------------------------------------------------------------------------------------------------------------
// Ambient cues: chimney smoke (house and smithy chimneys), lit windows and torches
// ---------------------------------------------------------------------------------------------------------------------------------

const HOUSES_GUM: [number, number][] = [[26, -12], [-26, -12], [-27, 7], [-9, -21], [-33, 22], [31, 8], [34, 14], [-35, -4]];
const HOUSES_KIZ: [number, number][] = [[20, -4], [-20, -4], [-24, -15], [24, -15]];
const HOUSES_CIFTLIK: [number, number][] = [[-7, -6], [7, -7]];

const SMOKE = [
  ...HOUSES_GUM.map(([dx, dz]) => ({ pos: at(GUM, dx, dz), y: 8 })),
  ...HOUSES_KIZ.map(([dx, dz]) => ({ pos: at(KIZ, dx, dz), y: 8 })),
  ...HOUSES_CIFTLIK.map(([dx, dz]) => ({ pos: at(CIFTLIK, dx, dz), y: 7 })),
];

const GLOWS = [
  ...HOUSES_GUM.map(([dx, dz]) => ({ pos: at(GUM, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  ...HOUSES_KIZ.map(([dx, dz]) => ({ pos: at(KIZ, dx + 0.4, dz + 0.4), y: 3.2, kind: 'window' as const })),
  ...HOUSES_CIFTLIK.map(([dx, dz]) => ({ pos: at(CIFTLIK, dx, dz), y: 3.0, kind: 'window' as const })),
  // torches on the four Kızılkaya gate towers
  ...[[-12, -24], [12, -24], [-12, 24], [12, 24]].map(([dx, dz]) => ({ pos: at(KIZ, dx, dz), y: 9, kind: 'torch' as const })),
];

/**
 * The Sisli Vadi ambient set. Walker stops and herd / zone centres are checked by dev/combat-sim/ambient.mjs; the runtime streams them
 * by chunk (scenes/world/AmbientLife.ts).
 */
export const SISLI_AMBIENT: AmbientDef = {
  npcs: WALKERS,
  critters: CRITTERS.map((c) => ({ id: c.id, kind: c.kind, center: c.center as [number, number], radius: c.radius, count: c.count })),
  herds: HERDS.map((h) => ({ id: h.id, center: h.center as [number, number], radius: h.radius, count: h.count })),
  smoke: SMOKE,
  glows: GLOWS,
  maxCritters: 220,
};
